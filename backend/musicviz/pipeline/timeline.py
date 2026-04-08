"""Stage 4 — Timeline synthesis: merge per-stem and global analyses."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from ..config import FINGERPRINT_VERSION

STEM_NAMES = ("vocals", "drums", "bass", "other")


def _load(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    with path.open() as f:
        return json.load(f)


def run_timeline(
    fingerprint_dir: Path,
    song_id: str,
    song_title: str,
    progress_cb: Callable[[float, str], None] | None = None,
) -> dict[str, Any]:
    """Build the unified timeline.json from analysis files."""
    analysis_dir = fingerprint_dir / "analysis"
    global_data = _load(analysis_dir / "global.json")
    if global_data is None:
        raise FileNotFoundError("global.json missing — run feature extraction first")

    stem_data: dict[str, dict[str, Any]] = {}
    for stem in STEM_NAMES:
        d = _load(analysis_dir / f"{stem}.json")
        if d is not None:
            stem_data[stem] = d

    if not stem_data:
        raise RuntimeError("No stem analysis data available")

    sample_rate = global_data["sample_rate"]
    hop_length = global_data["hop_length"]
    resolution_ms = (hop_length / sample_rate) * 1000.0

    n_frames = min(d["n_frames"] for d in stem_data.values())

    if progress_cb:
        progress_cb(0.1, "Building beat index")

    beat_times = global_data.get("beat_times", [])
    beat_conf = global_data.get("beat_confidence", [])
    downbeat_set = set(global_data.get("downbeat_times", []))

    beat_lookup: dict[int, dict[str, Any]] = {}
    for i, bt in enumerate(beat_times):
        frame_idx = int(round(bt * 1000.0 / resolution_ms))
        beat_lookup[frame_idx] = {
            "is_beat": True,
            "is_downbeat": bt in downbeat_set,
            "beat_num": (i % 4) + 1,
            "bar_num": (i // 4) + 1,
            "confidence": beat_conf[i] if i < len(beat_conf) else 0.0,
        }

    sections = global_data.get("sections", [])

    def section_for(t: float) -> str | None:
        for s in sections:
            if s["start_s"] <= t < s["end_s"]:
                return s["label"]
        return None

    if progress_cb:
        progress_cb(0.3, "Synthesizing frames")

    frames: list[dict[str, Any]] = []
    for f_idx in range(n_frames):
        t = f_idx * resolution_ms / 1000.0
        beat = beat_lookup.get(
            f_idx,
            {
                "is_beat": False,
                "is_downbeat": False,
                "beat_num": 0,
                "bar_num": 0,
                "confidence": 0.0,
            },
        )
        stems_frame: dict[str, Any] = {}
        for stem, d in stem_data.items():
            feats = d["features"]
            stems_frame[stem] = {
                "energy": feats["energy"][f_idx],
                "centroid": feats["centroid"][f_idx],
                "bandwidth": feats["bandwidth"][f_idx],
                "contrast": [c[f_idx] for c in feats["contrast"]],
                "rolloff": feats["rolloff"][f_idx],
                "chroma": [c[f_idx] for c in feats["chroma"]],
                "mfcc": [c[f_idx] for c in feats["mfcc"]],
                "onset": feats["onset"][f_idx],
                "zcr": feats["zcr"][f_idx],
            }
        frames.append(
            {
                "t": round(t, 4),
                "frame_idx": f_idx,
                "beat": beat,
                "section": section_for(t),
                "stems": stems_frame,
            }
        )

    if progress_cb:
        progress_cb(0.85, "Computing normalization")

    normalization = {stem: d["stats"] for stem, d in stem_data.items()}

    timeline = {
        "version": FINGERPRINT_VERSION,
        "song_id": song_id,
        "song_title": song_title,
        "duration_s": global_data["duration_s"],
        "resolution_ms": resolution_ms,
        "total_frames": n_frames,
        "bpm": global_data["bpm"],
        "key": f"{global_data['key']}{'m' if global_data.get('mode') == 'minor' else ''}",
        "sections": sections,
        "normalization": normalization,
        "frames": frames,
    }

    (fingerprint_dir / "timeline.json").write_text(json.dumps(timeline))

    if progress_cb:
        progress_cb(1.0, "Timeline written")
    return {
        "total_frames": n_frames,
        "duration_s": timeline["duration_s"],
        "bpm": timeline["bpm"],
        "key": timeline["key"],
    }
