import { createScene } from '/api/scene-sdk.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

let dpr = window.devicePixelRatio || 1;
function fit() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
}
fit();
window.addEventListener('resize', fit);

let drumStats = null;
let flash = 0;

function norm(v, s) {
  if (!s) return 0;
  return Math.max(0, Math.min(1, (v - s.min) / (s.max - s.min || 1)));
}

await createScene({
  onReady: ({ timeline }) => {
    drumStats = timeline?.normalization?.drums?.energy ?? null;
  },
  onFrame: ({ frame }) => {
    if (frame?.beat?.is_downbeat) flash = 1;
    flash *= 0.92;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = `rgba(10, 10, 10, ${0.25 + flash * 0.4})`;
    ctx.fillRect(0, 0, w, h);

    const e = frame ? norm(frame.stems.drums.energy, drumStats) : 0;
    const r = (Math.min(w, h) / 6) * (1 + e * 1.5);

    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${280 + e * 60}, 70%, ${40 + flash * 40}%)`;
    ctx.fill();
  },
});
