"""Song library management — audio files are copied into the project folder."""

from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO

from ..config import FINGERPRINT_VERSION, SUPPORTED_FORMATS
from .projects import ProjectStore


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _slugify(name: str) -> str:
    """Lowercase, ascii-safe, hyphen-separated slug."""
    name = name.strip().lower()
    name = re.sub(r"[^a-z0-9]+", "-", name).strip("-")
    return name or "song"


def _timestamp_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def _read_library(store: ProjectStore) -> list[dict[str, Any]]:
    if not store.library_json.exists():
        return []
    with store.library_json.open() as f:
        return json.load(f)


def _write_library(store: ProjectStore, songs: list[dict[str, Any]]) -> None:
    store.library_json.parent.mkdir(parents=True, exist_ok=True)
    store.library_json.write_text(json.dumps(songs, indent=2))


def list_songs(project_id: str) -> list[dict[str, Any]]:
    return _read_library(ProjectStore(project_id))


def get_song(project_id: str, song_id: str) -> dict[str, Any] | None:
    for s in _read_library(ProjectStore(project_id)):
        if s["id"] == song_id:
            return s
    return None


def add_song(project_id: str, src: BinaryIO, filename: str) -> dict[str, Any]:
    """Copy an uploaded audio file into the project library and register it."""
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported format: {suffix}")

    store = ProjectStore(project_id)
    if not store.exists():
        raise FileNotFoundError(f"Project not found: {project_id}")

    store.audio_dir.mkdir(parents=True, exist_ok=True)

    # Stream upload to a temp file inside the project so we can read tags
    # before deciding on the final {slug}-{timestamp} name.
    tmp_path = store.audio_dir / f".upload-{_timestamp_id()}{suffix}"
    try:
        with tmp_path.open("wb") as dst:
            shutil.copyfileobj(src, dst)

        title, artist = _read_tags(tmp_path)
        original_stem = Path(filename).stem
        display_title = title or original_stem

        slug = _slugify(display_title)
        song_id = f"{slug}-{_timestamp_id()}"
        # Disambiguate in the unlikely case of a same-second collision.
        existing_ids = {s["id"] for s in _read_library(store)}
        if song_id in existing_ids:
            n = 2
            while f"{song_id}-{n}" in existing_ids:
                n += 1
            song_id = f"{song_id}-{n}"

        audio_filename = f"{song_id}{suffix}"
        final_path = store.audio_dir / audio_filename
        tmp_path.replace(final_path)

        entry = {
            "id": song_id,
            "title": title or original_stem,
            "artist": artist or "Unknown",
            "audio_file": audio_filename,
            "original_filename": filename,
            "added": _now(),
            "duration_s": None,
            "format": suffix.lstrip("."),
            "fingerprinted": False,
            "fingerprint_version": FINGERPRINT_VERSION,
            "fingerprint_status": "idle",
        }
        songs = _read_library(store)
        songs.append(entry)
        _write_library(store, songs)
        return entry
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def update_song(project_id: str, song_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    store = ProjectStore(project_id)
    songs = _read_library(store)
    for i, s in enumerate(songs):
        if s["id"] == song_id:
            songs[i] = {**s, **updates}
            _write_library(store, songs)
            return songs[i]
    return None


def remove_song(project_id: str, song_id: str) -> bool:
    store = ProjectStore(project_id)
    songs = _read_library(store)
    removed = next((s for s in songs if s["id"] == song_id), None)
    if removed is None:
        return False
    _write_library(store, [s for s in songs if s["id"] != song_id])

    fp_dir = store.fingerprints_dir / song_id
    if fp_dir.exists():
        shutil.rmtree(fp_dir)

    audio_file = removed.get("audio_file")
    if audio_file:
        (store.audio_dir / audio_file).unlink(missing_ok=True)
    return True


def _read_tags(path: Path) -> tuple[str | None, str | None]:
    """Best-effort tag read; returns (title, artist)."""
    try:
        from mutagen import File as MutagenFile  # type: ignore

        mf = MutagenFile(str(path), easy=True)
        if mf is None:
            return None, None
        title = (mf.get("title") or [None])[0]
        artist = (mf.get("artist") or [None])[0]
        return title, artist
    except Exception:
        return None, None
