# MusicViz — Claude Code notes

Local-first music fingerprinting + visualization. Backend (FastAPI) computes a
per-song `timeline.json` from source-separated stems; the frontend (React/Vite)
plays scenes that react to that timeline.

## Authoring scenes

When the user asks for a new visual / scene / interactive world, scaffold it as a
**scene** under a project's `scenes/` directory. Read the SDK reference first:

- **SDK + schema docs:** `backend/musicviz/scenes/sdk/SDK.md`
- **TS types for the timeline:** `backend/musicviz/scenes/sdk/timeline.d.ts`
- **Starter templates:** `backend/musicviz/scenes/templates/`

Per-project scenes live at `./projects/{projectId}/scenes/{sceneId}/` in the
repo by default (override with `MUSICVIZ_PROJECTS_ROOT`). Each scene is plain HTML + JS — no
build step. The ScenePlayer view embeds them in a sandboxed iframe and drives
them with the audio playhead via `postMessage`.

To create a new scene you can either:

1. POST to `/api/projects/{projectId}/scenes` with `{templateId, name}` (used by
   the "+ New scene" UI button), then edit the resulting files, **or**
2. Copy a template directory directly with the Write tool, then edit.

After editing, the user just reloads the iframe in the ScenePlayer view — no
rebuild required.

## Layout cheatsheet

```
backend/musicviz/
  api/server.py          # FastAPI app entry
  api/scenes.py          # Scene/SDK/template endpoints
  pipeline/timeline.py   # Authoritative source for the timeline schema
  scenes/sdk/            # Shared SDK files served at /api/scene-sdk.js
  scenes/templates/      # Read-only template gallery
  storage/scenes.py      # Per-project scene CRUD + path-traversal guards

frontend/src/
  views/ScenePlayer.jsx  # The "portal" — iframe host + audio master clock
  views/FingerprintDetail.jsx  # Inspector for the raw timeline data
  api/client.js          # Adds listScenes / createScene / sceneEntryUrl helpers
```
