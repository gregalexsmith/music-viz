import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';

const STEMS = ['vocals', 'drums', 'bass', 'other'];

export default function ScenePlayer() {
  const { projectId, songId } = useParams();
  const [scenes, setScenes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activeSceneId, setActiveSceneId] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const audioRef = useRef(null);
  const iframeRef = useRef(null);
  const sceneReadyRef = useRef(false);

  // Load scene + template lists
  const refresh = async () => {
    try {
      const [s, t] = await Promise.all([
        api.listScenes(projectId),
        api.listSceneTemplates(),
      ]);
      setScenes(s);
      setTemplates(t);
      if (!activeSceneId && s.length > 0) setActiveSceneId(s[0].id);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const initPayload = useMemo(
    () => ({
      type: 'init',
      projectId,
      songId,
      timelineUrl: api.timelineUrl(projectId, songId),
      audioUrl: api.audioUrl(projectId, songId),
      stemUrls: STEMS.reduce((acc, s) => {
        acc[s] = api.stemUrl(projectId, songId, s);
        return acc;
      }, {}),
    }),
    [projectId, songId]
  );

  // Listen for scene-ready handshake from iframe
  useEffect(() => {
    sceneReadyRef.current = false;
    const onMsg = (ev) => {
      const msg = ev.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'scene-ready' && iframeRef.current?.contentWindow === ev.source) {
        sceneReadyRef.current = true;
        ev.source.postMessage(initPayload, '*');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [initPayload, activeSceneId]);

  // Drive ticks via rAF
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const audio = audioRef.current;
      const iframe = iframeRef.current;
      if (audio && iframe?.contentWindow && sceneReadyRef.current) {
        iframe.contentWindow.postMessage(
          { type: 'tick', t: audio.currentTime, playing: !audio.paused },
          '*'
        );
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [activeSceneId]);

  const handleCreate = async (templateId) => {
    setCreating(true);
    try {
      const created = await api.createScene(projectId, templateId, null);
      await refresh();
      setActiveSceneId(created.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (sceneId) => {
    if (!window.confirm(`Delete scene "${sceneId}"?`)) return;
    try {
      await api.deleteScene(projectId, sceneId);
      if (activeSceneId === sceneId) setActiveSceneId(null);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const sceneSrc = activeSceneId
    ? api.sceneEntryUrl(projectId, activeSceneId)
    : null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-950 flex items-center gap-4 flex-wrap">
        <Link
          to={`/projects/${projectId}/songs/${songId}`}
          className="text-indigo-400 hover:text-indigo-300 text-sm"
        >
          ← Inspector
        </Link>
        <span className="text-zinc-600">|</span>
        <label className="text-xs uppercase tracking-wider text-zinc-500">Scene</label>
        <select
          value={activeSceneId ?? ''}
          onChange={(e) => setActiveSceneId(e.target.value || null)}
          className="bg-zinc-800 text-sm border border-zinc-700 rounded px-2 py-1"
        >
          {scenes.length === 0 && <option value="">— none —</option>}
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || s.id}
            </option>
          ))}
        </select>

        {activeSceneId && (
          <button
            onClick={() => handleDelete(activeSceneId)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            delete
          </button>
        )}

        <span className="text-zinc-600">|</span>
        <label className="text-xs uppercase tracking-wider text-zinc-500">New from</label>
        {templates.map((t) => (
          <button
            key={t.id}
            disabled={creating}
            onClick={() => handleCreate(t.id)}
            className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
            title={t.description}
          >
            + {t.name}
          </button>
        ))}

        <div className="flex-1" />
        <audio ref={audioRef} src={api.audioUrl(projectId, songId)} controls className="h-8" />
      </div>

      {error && (
        <div className="px-6 py-2 bg-red-950 text-red-300 text-sm">{error}</div>
      )}

      <div className="flex-1 min-h-0 bg-black">
        {sceneSrc ? (
          <iframe
            key={activeSceneId}
            ref={iframeRef}
            src={sceneSrc}
            sandbox="allow-scripts allow-same-origin"
            className="w-full h-full border-0"
            title={activeSceneId}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
            No scene selected. Create one from a template above.
          </div>
        )}
      </div>
    </div>
  );
}
