import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import Waveform from '../components/Waveform.jsx';
import FeatureTimeline from '../components/FeatureTimeline.jsx';

const STEMS = ['vocals', 'drums', 'bass', 'other'];
const STEM_COLORS = {
  vocals: '#f472b6',
  drums: '#fbbf24',
  bass: '#60a5fa',
  other: '#a78bfa',
};
const FEATURES = ['energy', 'centroid', 'bandwidth', 'rolloff', 'onset', 'zcr'];

export default function FingerprintDetail() {
  const { projectId, songId } = useParams();
  const [timeline, setTimeline] = useState(null);
  const [waveform, setWaveform] = useState(null);
  const [feature, setFeature] = useState('energy');
  const [enabledStems, setEnabledStems] = useState({
    vocals: true,
    drums: true,
    bass: true,
    other: true,
  });
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [activeStem, setActiveStem] = useState('mix');
  const audioRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.getTimeline(projectId, songId),
      api.getWaveform(projectId, songId, 1500),
    ])
      .then(([tl, wf]) => {
        if (!mounted) return;
        setTimeline(tl);
        setWaveform(wf);
      })
      .catch((e) => mounted && setError(e.message));
    return () => {
      mounted = false;
    };
  }, [projectId, songId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !timeline) return;
    const onTime = () => setProgress(audio.currentTime / timeline.duration_s);
    audio.addEventListener('timeupdate', onTime);
    return () => audio.removeEventListener('timeupdate', onTime);
  }, [timeline]);

  if (error) {
    return (
      <div className="p-10">
        <p className="text-red-400">{error}</p>
        <Link to={`/projects/${projectId}`} className="text-indigo-400 text-sm">
          ← Back to library
        </Link>
      </div>
    );
  }
  if (!timeline || !waveform) {
    return <div className="p-10 text-zinc-500">Loading fingerprint…</div>;
  }

  const audioSrc =
    activeStem === 'mix'
      ? api.audioUrl(projectId, songId)
      : api.stemUrl(projectId, songId, activeStem);

  // Hover inspector frame
  const hoverFrame = timeline.frames[Math.floor(progress * timeline.frames.length)] ?? null;

  return (
    <div className="max-w-6xl mx-auto p-10">
      <Link
        to={`/projects/${projectId}`}
        className="text-indigo-400 hover:text-indigo-300 text-sm mb-4 inline-block"
      >
        ← Back to library
      </Link>
      <header className="mb-6">
        <h1 className="text-3xl font-bold">{timeline.song_title}</h1>
        <div className="flex gap-6 mt-2 text-sm text-zinc-400">
          <span>{timeline.duration_s.toFixed(1)}s</span>
          <span>{Math.round(timeline.bpm)} BPM</span>
          <span>Key: {timeline.key}</span>
          <span>{timeline.total_frames} frames</span>
          <span>{timeline.resolution_ms.toFixed(1)}ms / frame</span>
        </div>
      </header>

      <section className="mb-6 bg-zinc-900 border border-zinc-800 rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Playback
          </h2>
          <div className="flex gap-1">
            {['mix', ...STEMS].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setActiveStem(s);
                  if (audioRef.current) audioRef.current.load();
                }}
                className={`text-xs px-3 py-1 rounded ${
                  activeStem === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <Waveform
          peaks={waveform.peaks}
          color={activeStem === 'mix' ? '#a78bfa' : STEM_COLORS[activeStem]}
          progress={progress}
          height={90}
        />
        <audio ref={audioRef} src={audioSrc} controls className="w-full mt-3" />
      </section>

      <section className="mb-6 bg-zinc-900 border border-zinc-800 rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Feature Timeline
          </h2>
          <select
            value={feature}
            onChange={(e) => setFeature(e.target.value)}
            className="bg-zinc-800 text-sm border border-zinc-700 rounded px-2 py-1"
          >
            {FEATURES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <FeatureTimeline timeline={timeline} feature={feature} height={120} />
        <div className="flex gap-4 mt-3 text-xs">
          {STEMS.map((s) => (
            <label key={s} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabledStems[s]}
                onChange={(e) => setEnabledStems((x) => ({ ...x, [s]: e.target.checked }))}
              />
              <span style={{ color: STEM_COLORS[s] }}>{s}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="mb-6 bg-zinc-900 border border-zinc-800 rounded p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Sections
        </h2>
        <div className="flex gap-1 h-8 rounded overflow-hidden">
          {timeline.sections.map((s, i) => {
            const w = ((s.end_s - s.start_s) / timeline.duration_s) * 100;
            return (
              <div
                key={i}
                style={{ width: `${w}%`, background: `hsl(${(i * 47) % 360}, 50%, 35%)` }}
                className="text-[10px] flex items-center justify-center text-white truncate"
                title={`${s.label} (${s.start_s.toFixed(1)}–${s.end_s.toFixed(1)}s)`}
              >
                {s.label}
              </div>
            );
          })}
        </div>
      </section>

      {hoverFrame && (
        <section className="bg-zinc-900 border border-zinc-800 rounded p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
            Frame Inspector — t = {hoverFrame.t.toFixed(2)}s
            {hoverFrame.beat?.is_beat && (
              <span className="ml-2 text-amber-400">
                ● beat {hoverFrame.beat.beat_num}/4{hoverFrame.beat.is_downbeat ? ' (down)' : ''}
              </span>
            )}
            {hoverFrame.section && (
              <span className="ml-2 text-zinc-400">{hoverFrame.section}</span>
            )}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STEMS.map((stem) => {
              const data = hoverFrame.stems[stem];
              if (!data) return null;
              return (
                <div key={stem}>
                  <div
                    className="text-xs font-semibold mb-1"
                    style={{ color: STEM_COLORS[stem] }}
                  >
                    {stem}
                  </div>
                  <dl className="text-[11px] space-y-0.5 text-zinc-400 font-mono">
                    <div>energy: {data.energy.toFixed(3)}</div>
                    <div>centroid: {data.centroid.toFixed(0)}</div>
                    <div>bandwidth: {data.bandwidth.toFixed(0)}</div>
                    <div>rolloff: {data.rolloff.toFixed(0)}</div>
                    <div>onset: {data.onset.toFixed(2)}</div>
                    <div>zcr: {data.zcr.toFixed(3)}</div>
                  </dl>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
