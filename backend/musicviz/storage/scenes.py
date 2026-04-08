"""Scene file management — per-project scene directories + shared templates."""

from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .projects import ProjectStore

# Shared template gallery lives inside the package.
TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "scenes" / "templates"
SDK_DIR = Path(__file__).resolve().parent.parent / "scenes" / "sdk"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip().lower()).strip("-")
    return slug or "scene"


def _safe_join(root: Path, *parts: str) -> Path:
    """Join path parts under `root`, refusing any traversal outside it."""
    candidate = (root / Path(*parts)).resolve()
    root_resolved = root.resolve()
    if not candidate.is_relative_to(root_resolved):
        raise ValueError("Path escapes root")
    return candidate


# ---------------- Templates ----------------


def list_templates() -> list[dict[str, Any]]:
    if not TEMPLATES_DIR.exists():
        return []
    out: list[dict[str, Any]] = []
    for child in sorted(TEMPLATES_DIR.iterdir()):
        manifest = child / "manifest.json"
        if not manifest.exists():
            continue
        try:
            data = json.loads(manifest.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        data["id"] = child.name
        out.append(data)
    return out


def template_file(template_id: str, rel_path: str) -> Path:
    tpl_root = TEMPLATES_DIR / template_id
    if not tpl_root.exists():
        raise FileNotFoundError(template_id)
    return _safe_join(tpl_root, rel_path)


def sdk_file(rel_path: str) -> Path:
    return _safe_join(SDK_DIR, rel_path)


# ---------------- Per-project scenes ----------------


def _unique_scene_id(scenes_dir: Path, base: str) -> str:
    candidate = base
    i = 1
    while (scenes_dir / candidate).exists():
        i += 1
        candidate = f"{base}-{i}"
    return candidate


def list_scenes(project_id: str) -> list[dict[str, Any]]:
    store = ProjectStore(project_id)
    if not store.exists():
        raise FileNotFoundError(project_id)
    scenes_dir = store.scenes_dir
    if not scenes_dir.exists():
        return []
    out: list[dict[str, Any]] = []
    for child in sorted(scenes_dir.iterdir()):
        if not child.is_dir():
            continue
        manifest = child / "manifest.json"
        if not manifest.exists():
            continue
        try:
            data = json.loads(manifest.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        data["id"] = child.name
        out.append(data)
    return out


def create_scene_from_template(
    project_id: str,
    template_id: str,
    name: str | None = None,
) -> dict[str, Any]:
    store = ProjectStore(project_id)
    if not store.exists():
        raise FileNotFoundError(project_id)

    tpl_root = TEMPLATES_DIR / template_id
    if not tpl_root.exists() or not (tpl_root / "manifest.json").exists():
        raise ValueError(f"Unknown template: {template_id}")

    tpl_manifest = json.loads((tpl_root / "manifest.json").read_text())
    display_name = name or tpl_manifest.get("name") or template_id
    base = _slugify(display_name)

    scenes_dir = store.scenes_dir
    scenes_dir.mkdir(parents=True, exist_ok=True)
    scene_id = _unique_scene_id(scenes_dir, base)
    dest = scenes_dir / scene_id

    shutil.copytree(tpl_root, dest)

    manifest = dict(tpl_manifest)
    manifest["id"] = scene_id
    manifest["name"] = display_name
    manifest["template"] = template_id
    manifest["created"] = _now()
    (dest / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def delete_scene(project_id: str, scene_id: str) -> bool:
    store = ProjectStore(project_id)
    if not store.exists():
        return False
    target = _safe_join(store.scenes_dir, scene_id)
    if not target.exists() or not target.is_dir():
        return False
    shutil.rmtree(target)
    return True


def scene_file(project_id: str, scene_id: str, rel_path: str) -> Path:
    """Resolve a file path inside a project scene, with traversal protection."""
    store = ProjectStore(project_id)
    if not store.exists():
        raise FileNotFoundError(project_id)
    scene_root = _safe_join(store.scenes_dir, scene_id)
    if not scene_root.exists():
        raise FileNotFoundError(scene_id)
    if not rel_path:
        rel_path = "index.html"
    return _safe_join(scene_root, rel_path)
