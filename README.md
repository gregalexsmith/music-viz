# MusicViz

Local-first, project-based fingerprinting and visual generation engine for music.

Phase 1 status: **core pipeline + UI shell**.

```
music-viz/
├── backend/        Python — FastAPI server + fingerprinting pipeline
└── frontend/       React + Vite — local web UI
```

## What it does (Phase 1)

1. Create projects that live in `~/MusicViz/projects/<project-id>/`.
2. Add songs by uploading them — files are copied into the project's `library/audio/` folder so projects are self-contained and portable.
3. Run a 4-stage fingerprinting pipeline:
   - **Ingest** — validate file, read tags, write `meta.json`.
   - **Separate** — Demucs splits the song into `vocals`, `drums`, `bass`, `other` stems.
   - **Features** — Librosa extracts per-stem feature timeseries (energy, centroid, bandwidth, contrast, rolloff, chroma, MFCC, onset, ZCR) plus global beat grid, key, BPM, and structural sections.
   - **Timeline** — merges everything into a unified, time-indexed `timeline.json` that any generator can consume.
4. Inspect results in the UI: waveform, per-stem playback, scrollable feature timeline, section markers, beat grid, frame inspector.

## Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
python -m musicviz   # serves on http://127.0.0.1:8765
```

The first Demucs run downloads the model (~80MB) and is much faster on a CUDA GPU. CPU works fine but expect 30s–2min per song.

Override the projects directory with `MUSICVIZ_PROJECTS_ROOT=/some/path`.

## Frontend setup

```bash
cd frontend
npm install
npm run dev   # serves on http://127.0.0.1:5173
```

Vite proxies `/api` and `/ws` to the backend on port 8765.

## Project file layout

```
~/MusicViz/projects/<project-id>/
├── project.json
├── library/
│   ├── songs.json
│   └── audio/<song-hash>.<ext>
└── fingerprints/<song-hash>/
    ├── meta.json
    ├── stems/{vocals,drums,bass,other}.wav
    ├── analysis/{global,vocals,drums,bass,other}.json
    └── timeline.json
```

## API surface

| Method | Path | Description |
|---|---|---|
| POST | `/projects` | Create a project |
| GET | `/projects` | List projects |
| GET | `/projects/:id` | Get project metadata |
| DELETE | `/projects/:id` | Delete a project |
| GET | `/projects/:id/songs` | List songs in project |
| POST | `/projects/:id/songs` | Upload an audio file (multipart `file`) |
| DELETE | `/projects/:id/songs/:songId` | Remove a song |
| POST | `/projects/:id/songs/:songId/fingerprint` | Start pipeline (returns `job_id`) |
| GET | `/projects/:id/songs/:songId/fingerprint` | Pipeline status |
| GET | `/projects/:id/songs/:songId/timeline` | Unified timeline.json |
| GET | `/projects/:id/songs/:songId/analysis/:kind` | Raw per-stem or global analysis |
| GET | `/projects/:id/songs/:songId/stems/:stem` | Stream a stem WAV |
| GET | `/projects/:id/songs/:songId/audio` | Stream the original mix |
| GET | `/projects/:id/songs/:songId/waveform` | Downsampled waveform peaks |
| WS | `/ws/pipeline/:jobId` | Live progress stream |

## Next phases

- **Phase 2** — interactive timeline (zoom/pan), section editor, beat correction, first WebGL particle generator, Claude integration for scene description generation.
- **Phase 3** — generator plugin architecture, scene presets, audio-synced preview, video export, multiple generator types.
