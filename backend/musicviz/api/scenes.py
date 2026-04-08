"""Scene-related HTTP endpoints: SDK, templates, per-project scene CRUD + static."""

from __future__ import annotations

import mimetypes
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..storage import (
    create_scene_from_template,
    delete_scene,
    get_project,
    list_scenes,
    list_templates,
    scene_file,
    sdk_file,
    template_file,
)


class CreateSceneBody(BaseModel):
    templateId: str
    name: str | None = None


def _serve(path) -> FileResponse:
    if not path.exists() or not path.is_file():
        raise HTTPException(404, "Not found")
    media, _ = mimetypes.guess_type(str(path))
    # Force JS modules + .d.ts files to a sane MIME type.
    if path.suffix == ".js":
        media = "application/javascript"
    elif path.suffix == ".ts":
        media = "application/typescript"
    elif path.suffix == ".md":
        media = "text/markdown"
    return FileResponse(path, media_type=media or "application/octet-stream")


def create_scenes_router() -> APIRouter:
    router = APIRouter()

    # ---------------- SDK ----------------

    @router.get("/scene-sdk.js")
    def get_sdk() -> FileResponse:
        return _serve(sdk_file("scene-sdk.js"))

    @router.get("/scene-sdk/{rel_path:path}")
    def get_sdk_asset(rel_path: str) -> FileResponse:
        try:
            return _serve(sdk_file(rel_path))
        except ValueError:
            raise HTTPException(400, "Invalid path")

    # ---------------- Templates ----------------

    @router.get("/scene-templates")
    def get_templates() -> list[dict[str, Any]]:
        return list_templates()

    @router.get("/scene-templates/{template_id}/{rel_path:path}")
    def get_template_file(template_id: str, rel_path: str) -> FileResponse:
        try:
            return _serve(template_file(template_id, rel_path))
        except FileNotFoundError:
            raise HTTPException(404, "Template not found")
        except ValueError:
            raise HTTPException(400, "Invalid path")

    # ---------------- Per-project scenes ----------------

    @router.get("/projects/{project_id}/scenes")
    def get_scenes(project_id: str) -> list[dict[str, Any]]:
        if get_project(project_id) is None:
            raise HTTPException(404, "Project not found")
        return list_scenes(project_id)

    @router.post("/projects/{project_id}/scenes")
    def post_scene(project_id: str, body: CreateSceneBody) -> dict[str, Any]:
        if get_project(project_id) is None:
            raise HTTPException(404, "Project not found")
        try:
            return create_scene_from_template(project_id, body.templateId, body.name)
        except ValueError as e:
            raise HTTPException(400, str(e))
        except FileNotFoundError as e:
            raise HTTPException(404, str(e))

    @router.delete("/projects/{project_id}/scenes/{scene_id}")
    def delete_scene_route(project_id: str, scene_id: str) -> dict[str, bool]:
        ok = delete_scene(project_id, scene_id)
        if not ok:
            raise HTTPException(404, "Scene not found")
        return {"deleted": True}

    @router.get("/projects/{project_id}/scenes/{scene_id}/{rel_path:path}")
    def get_scene_asset(project_id: str, scene_id: str, rel_path: str) -> FileResponse:
        try:
            return _serve(scene_file(project_id, scene_id, rel_path))
        except FileNotFoundError:
            raise HTTPException(404, "Scene file not found")
        except ValueError:
            raise HTTPException(400, "Invalid path")

    return router
