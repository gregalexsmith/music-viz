"""Pipeline engine — orchestrates the 4 fingerprinting stages with progress."""

from __future__ import annotations

import asyncio
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from ..storage.projects import ProjectStore
from ..storage.songs import get_song, update_song
from .features import run_features
from .ingest import run_ingest
from .separate import run_separate
from .timeline import run_timeline

STAGES = ("ingest", "separate", "features", "timeline")


@dataclass
class ProgressEvent:
    job_id: str
    project_id: str
    song_id: str
    stage: str
    progress: float  # 0..1 within current stage
    overall: float   # 0..1 total
    message: str
    status: str  # running | done | error
    error: str | None = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds"))

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "project_id": self.project_id,
            "song_id": self.song_id,
            "stage": self.stage,
            "progress": round(self.progress, 4),
            "overall": round(self.overall, 4),
            "message": self.message,
            "status": self.status,
            "error": self.error,
            "timestamp": self.timestamp,
        }


@dataclass
class PipelineJob:
    job_id: str
    project_id: str
    song_id: str
    status: str = "pending"  # pending | running | done | error
    last_event: ProgressEvent | None = None


class PipelineEngine:
    """In-process pipeline engine with per-job pub/sub for progress."""

    def __init__(self) -> None:
        self.jobs: dict[str, PipelineJob] = {}
        self._subscribers: dict[str, list[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    def get_job(self, job_id: str) -> PipelineJob | None:
        return self.jobs.get(job_id)

    async def subscribe(self, job_id: str) -> asyncio.Queue:
        async with self._lock:
            q: asyncio.Queue = asyncio.Queue()
            self._subscribers.setdefault(job_id, []).append(q)
            job = self.jobs.get(job_id)
            if job and job.last_event:
                await q.put(job.last_event.to_dict())
            return q

    async def unsubscribe(self, job_id: str, q: asyncio.Queue) -> None:
        async with self._lock:
            subs = self._subscribers.get(job_id, [])
            if q in subs:
                subs.remove(q)

    async def _emit(self, event: ProgressEvent) -> None:
        job = self.jobs.get(event.job_id)
        if job:
            job.last_event = event
            job.status = event.status if event.status in ("done", "error") else "running"
        for q in list(self._subscribers.get(event.job_id, [])):
            await q.put(event.to_dict())

    def start_job(self, project_id: str, song_id: str) -> PipelineJob:
        job_id = uuid.uuid4().hex[:12]
        job = PipelineJob(job_id=job_id, project_id=project_id, song_id=song_id)
        self.jobs[job_id] = job
        loop = asyncio.get_running_loop()
        loop.create_task(self._run(job))
        return job

    async def _run(self, job: PipelineJob) -> None:
        loop = asyncio.get_running_loop()
        try:
            song = get_song(job.project_id, job.song_id)
            if song is None:
                raise FileNotFoundError(f"Song not found: {job.song_id}")

            store = ProjectStore(job.project_id)
            project = store.load()
            settings = project.get("settings", {})
            sample_rate = settings.get("sample_rate", 22050)
            hop_length = settings.get("hop_length", 512)
            demucs_model = settings.get("demucs_model", "htdemucs")

            audio_path = store.audio_path(song)
            fp_dir = store.fingerprints_dir / job.song_id

            update_song(job.project_id, job.song_id, {"fingerprint_status": "running"})

            stage_weights = {
                "ingest": 0.05,
                "separate": 0.65,
                "features": 0.25,
                "timeline": 0.05,
            }

            cumulative = 0.0

            def make_cb(stage: str):
                def cb(p: float, msg: str) -> None:
                    overall = cumulative + p * stage_weights[stage]
                    asyncio.run_coroutine_threadsafe(
                        self._emit(
                            ProgressEvent(
                                job_id=job.job_id,
                                project_id=job.project_id,
                                song_id=job.song_id,
                                stage=stage,
                                progress=p,
                                overall=overall,
                                message=msg,
                                status="running",
                            )
                        ),
                        loop,
                    )
                return cb

            # Stage 1 — Ingest
            await self._emit(self._evt(job, "ingest", 0.0, cumulative, "Ingest"))
            meta = await loop.run_in_executor(None, run_ingest, audio_path, fp_dir)
            cumulative += stage_weights["ingest"]
            update_song(job.project_id, job.song_id, {"duration_s": meta["duration_s"]})
            await self._emit(self._evt(job, "ingest", 1.0, cumulative, "Metadata extracted"))

            # Stage 2 — Demucs
            await self._emit(self._evt(job, "separate", 0.0, cumulative, "Running Demucs"))
            await loop.run_in_executor(
                None,
                lambda: run_separate(audio_path, fp_dir, demucs_model, make_cb("separate")),
            )
            cumulative += stage_weights["separate"]
            await self._emit(self._evt(job, "separate", 1.0, cumulative, "Stems written"))

            # Stage 3 — Features
            await self._emit(self._evt(job, "features", 0.0, cumulative, "Extracting features"))
            await loop.run_in_executor(
                None,
                lambda: run_features(audio_path, fp_dir, sample_rate, hop_length, make_cb("features")),
            )
            cumulative += stage_weights["features"]
            await self._emit(self._evt(job, "features", 1.0, cumulative, "Features extracted"))

            # Stage 4 — Timeline
            await self._emit(self._evt(job, "timeline", 0.0, cumulative, "Synthesizing timeline"))
            await loop.run_in_executor(
                None,
                lambda: run_timeline(fp_dir, job.song_id, song.get("title", ""), make_cb("timeline")),
            )
            cumulative = 1.0
            await self._emit(self._evt(job, "timeline", 1.0, 1.0, "Timeline complete"))

            update_song(
                job.project_id,
                job.song_id,
                {"fingerprinted": True, "fingerprint_status": "done"},
            )
            await self._emit(
                ProgressEvent(
                    job_id=job.job_id,
                    project_id=job.project_id,
                    song_id=job.song_id,
                    stage="timeline",
                    progress=1.0,
                    overall=1.0,
                    message="Pipeline complete",
                    status="done",
                )
            )
        except Exception as exc:
            traceback.print_exc()
            update_song(job.project_id, job.song_id, {"fingerprint_status": "error"})
            await self._emit(
                ProgressEvent(
                    job_id=job.job_id,
                    project_id=job.project_id,
                    song_id=job.song_id,
                    stage=job.last_event.stage if job.last_event else "unknown",
                    progress=job.last_event.progress if job.last_event else 0.0,
                    overall=job.last_event.overall if job.last_event else 0.0,
                    message="Pipeline failed",
                    status="error",
                    error=f"{type(exc).__name__}: {exc}",
                )
            )

    def _evt(
        self,
        job: PipelineJob,
        stage: str,
        progress: float,
        overall: float,
        message: str,
    ) -> ProgressEvent:
        return ProgressEvent(
            job_id=job.job_id,
            project_id=job.project_id,
            song_id=job.song_id,
            stage=stage,
            progress=progress,
            overall=overall,
            message=message,
            status="running",
        )
