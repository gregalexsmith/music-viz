"""FastAPI app exposing project, library, pipeline, and fingerprint endpoints."""

from __future__ import annotations

import asyncio
import json
import mimetypes
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from ..pipeline import PipelineEngine
from .scenes import create_scenes_router
from ..storage import (
    ProjectStore,
    add_song,
    create_project,
    delete_project,
    get_project,
    get_song,
    list_projects,
    list_songs,
    remove_song,
)


class CreateProjectBody(BaseModel):
    name: str


def create_app() -> FastAPI:
    app = FastAPI(title="MusicViz", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    engine = PipelineEngine()
    app.state.engine = engine

    app.include_router(create_scenes_router())

    # ---------------- Projects ----------------

    @app.post("/projects")
    def post_project(body: CreateProjectBody) -> dict[str, Any]:
        return create_project(body.name)

    @app.get("/projects")
    def get_projects() -> list[dict[str, Any]]:
        return list_projects()

    @app.get("/projects/{project_id}")
    def get_one_project(project_id: str) -> dict[str, Any]:
        proj = get_project(project_id)
        if proj is None:
            raise HTTPException(404, "Project not found")
        return proj

    @app.delete("/projects/{project_id}")
    def delete_one_project(project_id: str) -> dict[str, bool]:
        ok = delete_project(project_id)
        if not ok:
            raise HTTPException(404, "Project not found")
        return {"deleted": True}

    # ---------------- Songs ----------------

    @app.get("/projects/{project_id}/songs")
    def get_songs(project_id: str) -> list[dict[str, Any]]:
        if get_project(project_id) is None:
            raise HTTPException(404, "Project not found")
        return list_songs(project_id)

    @app.post("/projects/{project_id}/songs")
    async def post_song(project_id: str, request: Request) -> dict[str, Any]:
        if get_project(project_id) is None:
            raise HTTPException(404, "Project not found")
        # Parse the multipart body ourselves so we can raise the per-part size
        # limit well above Starlette's 1 MB default — songs are routinely many MB.
        form = await request.form(max_part_size=512 * 1024 * 1024)
        upload = form.get("file")
        if upload is None or not hasattr(upload, "filename"):
            raise HTTPException(400, "Missing 'file' field")
        try:
            return add_song(project_id, upload.file, upload.filename or "upload")
        except FileNotFoundError as e:
            raise HTTPException(404, str(e))
        except ValueError as e:
            raise HTTPException(400, str(e))
        finally:
            await upload.close()

    @app.delete("/projects/{project_id}/songs/{song_id}")
    def delete_song_route(project_id: str, song_id: str) -> dict[str, bool]:
        ok = remove_song(project_id, song_id)
        if not ok:
            raise HTTPException(404, "Song not found")
        return {"deleted": True}

    # ---------------- Fingerprint ----------------

    @app.post("/projects/{project_id}/songs/{song_id}/fingerprint")
    async def post_fingerprint(project_id: str, song_id: str) -> dict[str, Any]:
        if get_song(project_id, song_id) is None:
            raise HTTPException(404, "Song not found")
        job = engine.start_job(project_id, song_id)
        return {"job_id": job.job_id, "status": job.status}

    @app.get("/projects/{project_id}/songs/{song_id}/fingerprint")
    def get_fingerprint_status(project_id: str, song_id: str) -> dict[str, Any]:
        song = get_song(project_id, song_id)
        if song is None:
            raise HTTPException(404, "Song not found")
        return {
            "fingerprinted": song.get("fingerprinted", False),
            "status": song.get("fingerprint_status", "idle"),
        }

    @app.get("/projects/{project_id}/songs/{song_id}/timeline")
    def get_timeline(project_id: str, song_id: str) -> JSONResponse:
        path = ProjectStore(project_id).fingerprints_dir / song_id / "timeline.json"
        if not path.exists():
            raise HTTPException(404, "Timeline not found")
        return JSONResponse(content=json.loads(path.read_text()))

    @app.get("/projects/{project_id}/songs/{song_id}/analysis/{kind}")
    def get_analysis(project_id: str, song_id: str, kind: str) -> JSONResponse:
        if kind not in ("global", "vocals", "drums", "bass", "other"):
            raise HTTPException(400, "Unknown analysis kind")
        path = (
            ProjectStore(project_id).fingerprints_dir / song_id / "analysis" / f"{kind}.json"
        )
        if not path.exists():
            raise HTTPException(404, "Analysis not found")
        return JSONResponse(content=json.loads(path.read_text()))

    @app.get("/projects/{project_id}/songs/{song_id}/stems/{stem}")
    def get_stem(project_id: str, song_id: str, stem: str) -> FileResponse:
        if stem not in ("vocals", "drums", "bass", "other"):
            raise HTTPException(400, "Unknown stem")
        path = ProjectStore(project_id).fingerprints_dir / song_id / "stems" / f"{stem}.wav"
        if not path.exists():
            raise HTTPException(404, "Stem not found")
        return FileResponse(path, media_type="audio/wav")

    @app.get("/projects/{project_id}/songs/{song_id}/audio")
    def get_audio(project_id: str, song_id: str) -> FileResponse:
        song = get_song(project_id, song_id)
        if song is None:
            raise HTTPException(404, "Song not found")
        path = ProjectStore(project_id).audio_path(song)
        if not path.exists():
            raise HTTPException(404, "Audio file missing on disk")
        media, _ = mimetypes.guess_type(str(path))
        return FileResponse(path, media_type=media or "application/octet-stream")

    @app.get("/projects/{project_id}/songs/{song_id}/waveform")
    def get_waveform(project_id: str, song_id: str, points: int = 1000) -> dict[str, Any]:
        """Return downsampled peak data for waveform display."""
        song = get_song(project_id, song_id)
        if song is None:
            raise HTTPException(404, "Song not found")
        path = ProjectStore(project_id).audio_path(song)
        if not path.exists():
            raise HTTPException(404, "Audio file missing on disk")
        return _compute_waveform_peaks(path, points)

    # ---------------- WebSocket: pipeline progress ----------------

    @app.websocket("/ws/pipeline/{job_id}")
    async def ws_pipeline(websocket: WebSocket, job_id: str) -> None:
        await websocket.accept()
        if engine.get_job(job_id) is None:
            await websocket.send_json({"error": "Unknown job"})
            await websocket.close()
            return
        q = await engine.subscribe(job_id)
        try:
            while True:
                event = await q.get()
                await websocket.send_json(event)
                if event.get("status") in ("done", "error"):
                    break
        except WebSocketDisconnect:
            pass
        finally:
            await engine.unsubscribe(job_id, q)
            try:
                await websocket.close()
            except RuntimeError:
                pass

    return app


def _compute_waveform_peaks(path: Path, points: int) -> dict[str, Any]:
    import numpy as np
    import soundfile as sf

    data, sr = sf.read(str(path), always_2d=True)
    mono = data.mean(axis=1)
    n = len(mono)
    if n == 0:
        return {"peaks": [], "duration_s": 0.0, "sample_rate": sr}
    bucket = max(1, n // points)
    trimmed = mono[: bucket * (n // bucket)]
    reshaped = trimmed.reshape(-1, bucket)
    peaks = np.max(np.abs(reshaped), axis=1).tolist()
    return {
        "peaks": peaks,
        "duration_s": float(n / sr),
        "sample_rate": int(sr),
    }


app = create_app()
