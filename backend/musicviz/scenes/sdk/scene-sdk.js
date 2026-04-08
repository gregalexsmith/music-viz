// MusicViz Scene SDK
// =================
// A tiny ES module that scenes import to receive timing + data from the
// parent ScenePlayer. The parent owns the <audio> element and broadcasts
// `currentTime` every requestAnimationFrame; the SDK looks up the matching
// timeline frame and hands it to the scene.
//
// Usage inside a scene's index.html / scene.js:
//
//   import { createScene } from '/api/scene-sdk.js';
//
//   await createScene({
//     onReady: async ({ timeline, stemUrls }) => { ... },
//     onFrame: ({ t, frame, playing }) => { ... },
//     onResize: ({ width, height }) => { ... },
//   });

const PARENT_ORIGIN = '*'; // Sandboxed iframe; we trust postMessage from parent

function frameAt(timeline, t) {
  if (!timeline || !timeline.frames || timeline.frames.length === 0) return null;
  const idx = Math.round((t * 1000) / timeline.resolution_ms);
  if (idx < 0) return null;
  if (idx >= timeline.frames.length) return timeline.frames[timeline.frames.length - 1];
  return timeline.frames[idx];
}

export async function createScene(handlers = {}) {
  const { onReady, onFrame, onResize } = handlers;

  let timeline = null;
  let initCtx = null;
  let resolveInit;
  const initPromise = new Promise((r) => {
    resolveInit = r;
  });

  function handleMessage(ev) {
    const msg = ev.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'init') {
      initCtx = msg;
      (async () => {
        try {
          const res = await fetch(msg.timelineUrl);
          timeline = await res.json();
        } catch (err) {
          console.error('[scene-sdk] failed to load timeline', err);
        }
        if (onReady) {
          try {
            await onReady({
              timeline,
              stemUrls: msg.stemUrls || {},
              audioUrl: msg.audioUrl,
              songId: msg.songId,
              projectId: msg.projectId,
            });
          } catch (err) {
            console.error('[scene-sdk] onReady threw', err);
          }
        }
        resolveInit({ timeline, ...msg });
      })();
    } else if (msg.type === 'tick') {
      if (!onFrame) return;
      const frame = timeline ? frameAt(timeline, msg.t) : null;
      try {
        onFrame({ t: msg.t, frame, playing: !!msg.playing, timeline });
      } catch (err) {
        console.error('[scene-sdk] onFrame threw', err);
      }
    } else if (msg.type === 'resize') {
      if (onResize) {
        try {
          onResize({ width: msg.width, height: msg.height });
        } catch (err) {
          console.error('[scene-sdk] onResize threw', err);
        }
      }
    }
  }

  window.addEventListener('message', handleMessage);

  // Tell the parent we're alive and ready to receive `init`.
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'scene-ready' }, PARENT_ORIGIN);
  }

  return {
    /** Resolves once the parent has sent `init` and the timeline has loaded. */
    ready: () => initPromise,
    /** Look up the timeline frame at an arbitrary time `t` (seconds). */
    frameAt: (t) => frameAt(timeline, t),
    /** The currently loaded timeline (after ready()). */
    get timeline() {
      return timeline;
    },
    /** The init context (songId, projectId, urls). */
    get context() {
      return initCtx;
    },
  };
}
