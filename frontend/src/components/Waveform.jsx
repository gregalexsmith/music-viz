import { useEffect, useRef } from 'react';

export default function Waveform({ peaks, color = '#a78bfa', height = 80, progress = 0 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const mid = height / 2;
    const stride = peaks.length / width;

    ctx.fillStyle = color;
    for (let x = 0; x < width; x++) {
      const idx = Math.floor(x * stride);
      const v = peaks[idx] ?? 0;
      const h = v * (height * 0.9);
      ctx.fillRect(x, mid - h / 2, 1, h);
    }

    if (progress > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(0, 0, width * progress, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(width * progress - 1, 0, 2, height);
    }
  }, [peaks, color, height, progress]);

  return <canvas ref={canvasRef} className="w-full block" style={{ height }} />;
}
