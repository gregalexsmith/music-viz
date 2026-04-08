"""Stage 3 — Per-stem feature extraction with Librosa."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

import numpy as np

STEM_NAMES = ("vocals", "drums", "bass", "other")


def _to_list(arr) -> list:
    return arr.tolist() if hasattr(arr, "tolist") else list(arr)


def extract_stem_features(
    stem_path: Path,
    sample_rate: int,
    hop_length: int,
) -> dict[str, Any]:
    """Compute the per-stem feature timeseries for a single audio file."""
    import librosa
    import numpy as np

    y, sr = librosa.load(str(stem_path), sr=sample_rate, mono=True)

    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
    bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr, hop_length=hop_length)[0]
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr, hop_length=hop_length)
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, hop_length=hop_length)[0]
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=hop_length)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, hop_length=hop_length, n_mfcc=13)
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    zcr = librosa.feature.zero_crossing_rate(y=y, hop_length=hop_length)[0]

    n_frames = min(
        len(rms),
        len(centroid),
        len(bandwidth),
        contrast.shape[1],
        len(rolloff),
        chroma.shape[1],
        mfcc.shape[1],
        len(onset),
        len(zcr),
    )

    def trim_1d(a):
        return _to_list(a[:n_frames])

    def trim_2d(a):
        return [_to_list(a[i, :n_frames]) for i in range(a.shape[0])]

    return {
        "n_frames": int(n_frames),
        "hop_length": int(hop_length),
        "sample_rate": int(sr),
        "features": {
            "energy": trim_1d(rms),
            "centroid": trim_1d(centroid),
            "bandwidth": trim_1d(bandwidth),
            "contrast": trim_2d(contrast),
            "rolloff": trim_1d(rolloff),
            "chroma": trim_2d(chroma),
            "mfcc": trim_2d(mfcc),
            "onset": trim_1d(onset),
            "zcr": trim_1d(zcr),
        },
        "stats": _per_feature_stats(
            {
                "energy": rms[:n_frames],
                "centroid": centroid[:n_frames],
                "bandwidth": bandwidth[:n_frames],
                "rolloff": rolloff[:n_frames],
                "onset": onset[:n_frames],
                "zcr": zcr[:n_frames],
            }
        ),
    }


def _per_feature_stats(features: dict[str, Any]) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for name, vals in features.items():
        if len(vals) == 0:
            out[name] = {"min": 0.0, "max": 0.0, "mean": 0.0, "std": 0.0}
            continue
        out[name] = {
            "min": float(vals.min()),
            "max": float(vals.max()),
            "mean": float(vals.mean()),
            "std": float(vals.std()),
        }
    return out


def extract_global_features(
    audio_path: Path,
    sample_rate: int,
    hop_length: int,
) -> dict[str, Any]:
    """Beat grid, tempo, key, and structural segments from the full mix."""
    import librosa
    import numpy as np

    y, sr = librosa.load(str(audio_path), sr=sample_rate, mono=True)

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop_length)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)

    # Beat confidence: normalized onset strength at beat positions
    if len(onset_env) and len(beat_frames):
        max_env = float(onset_env.max()) or 1.0
        beat_conf = [float(onset_env[min(int(b), len(onset_env) - 1)] / max_env) for b in beat_frames]
    else:
        beat_conf = []

    # Downbeats — assume 4/4, every 4th beat is a downbeat
    downbeat_times = [float(t) for i, t in enumerate(beat_times) if i % 4 == 0]

    # Key estimation via chroma → Krumhansl-like correlation
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)
    key, mode = _estimate_key(chroma)

    # Sectioning: agglomerative clustering on chroma+mfcc
    sections = _segment_sections(y, sr, hop_length)

    # Tempo curve
    tempo_curve = librosa.feature.tempo(
        onset_envelope=onset_env, sr=sr, hop_length=hop_length, aggregate=None
    )

    return {
        "duration_s": float(len(y) / sr),
        "sample_rate": int(sr),
        "hop_length": int(hop_length),
        "bpm": float(np.asarray(tempo).reshape(-1)[0]),
        "key": key,
        "mode": mode,
        "beat_times": [float(t) for t in beat_times],
        "beat_confidence": beat_conf,
        "downbeat_times": downbeat_times,
        "tempo_curve": _to_list(tempo_curve),
        "sections": sections,
    }


KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def _estimate_key(chroma) -> tuple[str, str]:
    import numpy as np

    chroma_mean = chroma.mean(axis=1)
    if chroma_mean.sum() == 0:
        return "C", "major"
    chroma_mean = chroma_mean / chroma_mean.sum()

    best_score = -1.0
    best_key = "C"
    best_mode = "major"
    for i in range(12):
        for profile, mode in ((MAJOR_PROFILE, "major"), (MINOR_PROFILE, "minor")):
            rotated = np.roll(profile, i)
            score = float(np.corrcoef(chroma_mean, rotated)[0, 1])
            if score > best_score:
                best_score = score
                best_key = KEY_NAMES[i]
                best_mode = mode
    return best_key, best_mode


def _segment_sections(y, sr: int, hop_length: int) -> list[dict[str, Any]]:
    import librosa
    import numpy as np

    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)
        bound_frames = librosa.segment.agglomerative(chroma, k=8)
        bound_times = librosa.frames_to_time(bound_frames, sr=sr, hop_length=hop_length)
        duration = float(len(y) / sr)
        bounds = list(bound_times) + [duration]
        labels = ["intro", "verse_1", "chorus_1", "verse_2", "chorus_2", "bridge", "chorus_3", "outro"]
        out = []
        for i in range(len(bounds) - 1):
            label = labels[i] if i < len(labels) else f"section_{i+1}"
            out.append(
                {
                    "start_s": float(bounds[i]),
                    "end_s": float(bounds[i + 1]),
                    "label": label,
                }
            )
        return out
    except Exception:
        return []


def run_features(
    audio_path: Path,
    fingerprint_dir: Path,
    sample_rate: int,
    hop_length: int,
    progress_cb: Callable[[float, str], None] | None = None,
) -> dict[str, Any]:
    """Run feature extraction for all stems + the full mix."""
    analysis_dir = fingerprint_dir / "analysis"
    analysis_dir.mkdir(parents=True, exist_ok=True)
    stems_dir = fingerprint_dir / "stems"

    summary: dict[str, Any] = {"stems": {}, "global": None}

    total = len(STEM_NAMES) + 1  # stems + global
    step = 0

    for stem in STEM_NAMES:
        stem_path = stems_dir / f"{stem}.wav"
        if not stem_path.exists():
            continue
        if progress_cb:
            progress_cb(step / total, f"Analyzing {stem}")
        data = extract_stem_features(stem_path, sample_rate, hop_length)
        (analysis_dir / f"{stem}.json").write_text(json.dumps(data))
        summary["stems"][stem] = {"n_frames": data["n_frames"], "stats": data["stats"]}
        step += 1

    if progress_cb:
        progress_cb(step / total, "Analyzing global features")
    global_data = extract_global_features(audio_path, sample_rate, hop_length)
    (analysis_dir / "global.json").write_text(json.dumps(global_data))
    summary["global"] = {"bpm": global_data["bpm"], "key": global_data["key"]}

    if progress_cb:
        progress_cb(1.0, "Feature extraction complete")
    return summary
