import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore.js';

export default function Library() {
  const { projectId } = useParams();
  const { currentProject, songs, jobs, openProject, addSong, removeSong, startFingerprint } =
    useStore();
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    openProject(projectId).catch((e) => setError(e.message));
  }, [projectId, openProject]);

  async function handleFileChange(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of files) {
        await addSong(file);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (!currentProject) {
    return <div className="p-10 text-zinc-500">Loading project…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">{currentProject.name}</h1>
        <p className="text-zinc-500 text-sm">
          {songs.length} song{songs.length === 1 ? '' : 's'}
        </p>
      </header>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Add Song
        </h2>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.flac,.aac,.ogg,.m4a,audio/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded font-medium"
        >
          {uploading ? 'Uploading…' : 'Choose audio file…'}
        </button>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        <p className="text-xs text-zinc-600 mt-2">
          Files are copied into the project folder.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Library
        </h2>
        {songs.length === 0 ? (
          <p className="text-zinc-600">No songs yet.</p>
        ) : (
          <ul className="space-y-2">
            {songs.map((song) => (
              <SongRow
                key={song.id}
                song={song}
                job={jobs[song.id]}
                projectId={projectId}
                onFingerprint={() => startFingerprint(song.id)}
                onRemove={() => removeSong(song.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SongRow({ song, job, projectId, onFingerprint, onRemove }) {
  const status = job?.status ?? song.fingerprint_status ?? 'idle';
  const overall = job?.overall ?? (song.fingerprinted ? 1 : 0);
  const isRunning = status === 'running';
  const isDone = song.fingerprinted || status === 'done';

  return (
    <li className="bg-zinc-900 border border-zinc-800 rounded p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{song.title}</div>
          <div className="text-xs text-zinc-500 truncate">{song.artist}</div>
          <div className="text-[10px] text-zinc-600 truncate font-mono mt-1">
            {song.original_filename ?? song.audio_file}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} done={isDone} />
          {isDone && (
            <Link
              to={`/projects/${projectId}/songs/${song.id}`}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded"
            >
              Inspect
            </Link>
          )}
          {!isRunning && !isDone && (
            <button
              onClick={onFingerprint}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded"
            >
              Fingerprint
            </button>
          )}
          {isDone && (
            <button
              onClick={onFingerprint}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded"
            >
              Re-run
            </button>
          )}
          <button
            onClick={onRemove}
            className="text-xs text-zinc-500 hover:text-red-400 px-2"
          >
            Remove
          </button>
        </div>
      </div>
      {isRunning && (
        <div className="mt-3">
          <div className="h-1.5 bg-zinc-800 rounded overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-200"
              style={{ width: `${Math.round(overall * 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-zinc-500">
            <span>{job?.stage} — {job?.message}</span>
            <span>{Math.round(overall * 100)}%</span>
          </div>
        </div>
      )}
      {status === 'error' && job?.error && (
        <div className="mt-3 text-xs text-red-400">{job.error}</div>
      )}
    </li>
  );
}

function StatusBadge({ status, done }) {
  const map = {
    idle: ['Idle', 'bg-zinc-800 text-zinc-400'],
    running: ['Processing', 'bg-amber-900/40 text-amber-300'],
    done: ['Ready', 'bg-emerald-900/40 text-emerald-300'],
    error: ['Error', 'bg-red-900/40 text-red-300'],
  };
  const [label, cls] = map[done ? 'done' : status] ?? map.idle;
  return <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded ${cls}`}>{label}</span>;
}
