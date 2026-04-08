import { useEffect, useRef } from 'react';

const STEM_COLORS = {
  vocals: '#f472b6',
  drums: '#fbbf24',
  bass: '#60a5fa',
  other: '#a78bfa',
};

export default function FeatureTimeline({ timeline, feature = 'energy', height = 60 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !timeline) return;
    const frames = timeline.frames;
    if (!frames || frames.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const stems = Object.keys(timeline.normalization || {});
    const xStep = width / frames.length;

    for (const stem of stems) {
      const stats = timeline.normalization[stem]?.[feature];
      if (!stats) continue;
      const range = stats.max - stats.min || 1;
      ctx.strokeStyle = STEM_COLORS[stem] ?? '#888';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (let i = 0; i < frames.length; i++) {
        const v = frames[i].stems[stem]?.[feature] ?? 0;
        const norm = (v - stats.min) / range;
        const y = height - norm * height;
        const x = i * xStep;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Beat ticks
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (const f of frames) {
      if (f.beat?.is_beat) {
        const x = (f.frame_idx / frames.length) * width;
        ctx.fillRect(x, height - 4, 1, 4);
      }
    }
  }, [timeline, feature, height]);

  return <canvas ref={canvasRef} className="w-full block" style={{ height }} />;
}
