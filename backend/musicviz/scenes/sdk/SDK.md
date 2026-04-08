# MusicViz Scene SDK

This is the authoring reference for **scenes** — visual / interactive worlds that are
driven by a song's fingerprint data.

A scene is just a directory of static files (HTML + JS + assets). The MusicViz backend
serves it inside a sandboxed iframe; the parent app owns audio playback and broadcasts
the current playhead time every animation frame. Your scene reacts.

There is **no build step**. No bundler, no React, no TypeScript compile. Open files,
edit, reload the iframe.

## Where scenes live

```
~/MusicViz/projects/{projectId}/scenes/{sceneId}/
  manifest.json    # name, description, entry, version
  index.html       # entry point loaded inside the iframe
  scene.js         # your code
  assets/          # textures, shaders, models, anything
```

You can scaffold a new scene from a template via the UI ("+ New scene") or with:

```
POST /api/projects/{projectId}/scenes
{ "templateId": "minimal-canvas", "name": "My Scene" }
```

Available templates: see `GET /api/scene-templates`.

## The SDK

Import it as an ES module from the URL the parent serves it at:

```html
<script type="module">
  import { createScene } from '/api/scene-sdk.js';

  await createScene({
    onReady:  async ({ timeline, stemUrls }) => { /* one-time setup */ },
    onFrame:  ({ t, frame, playing })       => { /* per-rAF render  */ },
    onResize: ({ width, height })           => { /* canvas resize   */ },
  });
</script>
```

### `onReady({ timeline, stemUrls, audioUrl, songId, projectId })`
Called once after the parent has sent the init message and the timeline JSON has
been fetched. Use this to create your renderer (canvas, three.js, WebGL),
preload assets, and read song-wide metadata (BPM, key, sections, normalization
ranges).

### `onFrame({ t, frame, playing, timeline })`
Called every animation frame the parent emits a `tick`. `t` is the playhead in
seconds. `frame` is the timeline frame at `t` (or `null` if before the song
starts). `playing` is true while the user has hit play.

Look at the **Frame schema** below for what's inside `frame`.

### `onResize({ width, height })`
Optional. Forwarded from the parent if/when the iframe is resized.

## Timeline schema (one frame ≈ 23ms)

See `timeline.d.ts` for the full TypeScript declaration. Key shape:

```js
frame = {
  t: 1.234,                  // seconds
  frame_idx: 53,
  beat: {
    is_beat: true,
    is_downbeat: false,
    beat_num: 2,             // 1..4 in a 4/4 bar
    bar_num: 7,
    confidence: 0.83,        // 0..1
  },
  section: "chorus_1",       // or null
  stems: {
    vocals: { energy, centroid, bandwidth, contrast[7], rolloff, chroma[12], mfcc[13], onset, zcr },
    drums:  { ... },
    bass:   { ... },
    other:  { ... },
  },
}
```

The whole-song `timeline` object also exposes:

- `timeline.bpm`, `timeline.key`, `timeline.duration_s`
- `timeline.sections` — array of `{ start_s, end_s, label }`
- `timeline.normalization[stem][feature]` — `{ min, max, mean, std }` for
  scaling raw values to 0..1 in your scene
- `timeline.resolution_ms` — frame spacing
- `timeline.frames` — flat array of all frames (you don't usually need this;
  the SDK indexes into it for you in `onFrame`)

### Normalizing values

Raw `energy` / `centroid` / etc. live in arbitrary units. To map a stem feature
to 0..1 robustly:

```js
function norm(value, stats) {
  return Math.max(0, Math.min(1, (value - stats.min) / (stats.max - stats.min || 1)));
}

// in onFrame:
const drums = frame.stems.drums.energy;
const drumLevel = norm(drums, timeline.normalization.drums.energy);
```

## Common patterns

**React to drum hits**

```js
onFrame({ frame, timeline }) {
  if (!frame) return;
  const e = norm(frame.stems.drums.energy, timeline.normalization.drums.energy);
  blob.scale = 1 + e * 2;
}
```

**Flash on every downbeat**

```js
onFrame({ frame }) {
  if (frame?.beat.is_downbeat) flash();
}
```

**Section-driven palette**

```js
onReady({ timeline }) {
  const palette = {};
  timeline.sections.forEach((s, i) => {
    palette[s.label] = `hsl(${(i * 67) % 360}, 60%, 55%)`;
  });
  this.palette = palette;
}
onFrame({ frame }) {
  if (frame?.section) renderer.bg = this.palette[frame.section];
}
```

**Roll your own audio analysis**

The parent's `<audio>` is the master clock — don't fight it. But if you want
finer-grain spectrum data than the precomputed timeline, you can fetch a stem
URL and run your own `AudioContext.decodeAudioData` + offline analysis at
load time:

```js
onReady: async ({ stemUrls }) => {
  const buf = await fetch(stemUrls.drums).then((r) => r.arrayBuffer());
  const ctx = new OfflineAudioContext(1, 1, 22050);
  const decoded = await ctx.decodeAudioData(buf);
  // ... analyze
}
```

## Iframe sandbox notes

Scenes run in an iframe with `sandbox="allow-scripts"`. That means:

- Same-origin requests work (you're on the backend's origin via the proxy).
- No cookies, no top-level navigation.
- `localStorage` is not available.
- `console.log` shows up in the parent devtools.
- You can use any rendering library — load it from a CDN with a `<script>` tag,
  or vendor it into your scene's `assets/` directory.
