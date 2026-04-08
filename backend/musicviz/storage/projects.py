"""Project file management."""

from __future__ import annotations

import json
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..config import DEFAULT_SETTINGS, PROJECT_VERSION, project_dir, projects_root


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip().lower()).strip("-")
    return slug or "project"


def _unique_id(name: str) -> str:
    base = _slugify(name)
    candidate = base
    i = 1
    while project_dir(candidate).exists():
        i += 1
        candidate = f"{base}-{i}"
    return candidate


class ProjectStore:
    """Reads and writes a single project's project.json."""

    def __init__(self, project_id: str):
        self.project_id = project_id
        self.dir = project_dir(project_id)

    @property
    def project_json(self) -> Path:
        return self.dir / "project.json"

    @property
    def library_json(self) -> Path:
        return self.dir / "library" / "songs.json"

    @property
    def fingerprints_dir(self) -> Path:
        return self.dir / "fingerprints"

    @property
    def audio_dir(self) -> Path:
        return self.dir / "library" / "audio"

    @property
    def scenes_dir(self) -> Path:
        return self.dir / "scenes"

    def audio_path(self, song: dict[str, Any]) -> Path:
        return self.audio_dir / song["audio_file"]

    def exists(self) -> bool:
        return self.project_json.exists()

    def load(self) -> dict[str, Any]:
        with self.project_json.open() as f:
            return json.load(f)

    def save(self, data: dict[str, Any]) -> None:
        data["modified"] = _now()
        self.project_json.write_text(json.dumps(data, indent=2))


def create_project(name: str) -> dict[str, Any]:
    project_id = _unique_id(name)
    pdir = project_dir(project_id)
    (pdir / "library" / "audio").mkdir(parents=True, exist_ok=True)
    (pdir / "fingerprints").mkdir(parents=True, exist_ok=True)
    (pdir / "scenes").mkdir(parents=True, exist_ok=True)

    now = _now()
    data = {
        "id": project_id,
        "name": name,
        "created": now,
        "modified": now,
        "version": PROJECT_VERSION,
        "settings": dict(DEFAULT_SETTINGS),
    }
    (pdir / "project.json").write_text(json.dumps(data, indent=2))
    (pdir / "library" / "songs.json").write_text("[]")
    return data


def list_projects() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    root = projects_root()
    for child in sorted(root.iterdir()):
        pj = child / "project.json"
        if pj.exists():
            try:
                with pj.open() as f:
                    data = json.load(f)
                data["id"] = child.name
                out.append(data)
            except (json.JSONDecodeError, OSError):
                continue
    return out


def get_project(project_id: str) -> dict[str, Any] | None:
    store = ProjectStore(project_id)
    if not store.exists():
        return None
    data = store.load()
    data["id"] = project_id
    return data


def delete_project(project_id: str) -> bool:
    pdir = project_dir(project_id)
    if not pdir.exists():
        return False
    shutil.rmtree(pdir)
    return True
