"""Global configuration and paths."""

from __future__ import annotations

import os
from pathlib import Path

FINGERPRINT_VERSION = "1.0"
PROJECT_VERSION = "1.0"

REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_PROJECTS_ROOT = Path(
    os.environ.get("MUSICVIZ_PROJECTS_ROOT", str(REPO_ROOT / "projects"))
).expanduser()

DEFAULT_SETTINGS = {
    "analysis_resolution_ms": 23.2,
    "demucs_model": "htdemucs",
    "sample_rate": 22050,
    "hop_length": 512,
}

SUPPORTED_FORMATS = {".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"}


def projects_root() -> Path:
    DEFAULT_PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)
    return DEFAULT_PROJECTS_ROOT


def project_dir(project_id: str) -> Path:
    return projects_root() / project_id
