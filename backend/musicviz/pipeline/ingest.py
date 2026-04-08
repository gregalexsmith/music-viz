"""Stage 1 — Ingest & Metadata."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..config import SUPPORTED_FORMATS


def run_ingest(audio_path: Path, fingerprint_dir: Path) -> dict[str, Any]:
    """Validate file, extract metadata, write meta.json."""
    if not audio_path.exists():
        raise FileNotFoundError(f"File not found: {audio_path}")
    if audio_path.suffix.lower() not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported format: {audio_path.suffix}")

    fingerprint_dir.mkdir(parents=True, exist_ok=True)

    import soundfile as sf  # lazy import

    info = sf.info(str(audio_path))
    duration_s = float(info.frames) / float(info.samplerate)

    title, artist, album = _read_tags(audio_path)

    meta: dict[str, Any] = {
        "path": str(audio_path),
        "format": audio_path.suffix.lstrip(".").lower(),
        "duration_s": duration_s,
        "sample_rate": int(info.samplerate),
        "channels": int(info.channels),
        "frames": int(info.frames),
        "tags": {
            "title": title,
            "artist": artist,
            "album": album,
        },
    }

    (fingerprint_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


def _read_tags(path: Path) -> tuple[str | None, str | None, str | None]:
    try:
        from mutagen import File as MutagenFile  # type: ignore

        mf = MutagenFile(str(path), easy=True)
        if mf is None:
            return None, None, None
        title = (mf.get("title") or [None])[0]
        artist = (mf.get("artist") or [None])[0]
        album = (mf.get("album") or [None])[0]
        return title, artist, album
    except Exception:
        return None, None, None
