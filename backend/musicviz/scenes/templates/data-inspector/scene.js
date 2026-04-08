// Data Inspector — visualizes every field in the timeline schema.
// Use this as a live reference for what data your scenes can react to.

import { createScene } from '/api/scene-sdk.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const STEMS = ['vocals', 'drums', 'bass', 'other'];
const STEM_COLORS = {
  vocals: '#ff7eb6',
  drums: '#ffd166',
  bass: '#7afcff',
  other: '#a78bfa',
};

const SCALAR_FEATURES = ['energy', 'centroid', 'bandwidth', 'rolloff', 'onset', 'zcr'];

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

let dpr = 1;
function fit() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
}
fit();
window.addEventListener('resize', fit);

let timeline = null;
let context = null;

function norm(value, stats) {
  if (!stats) return 0;
  const range = stats.max - stats.min || 1;
  return Math.max(0, Math.min(1, (value - stats.min) / range));
}

function fmt(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  return n.toFixed(digits);
}

function fmtTime(t) {
  if (t == null) return '—';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------- drawing helpers ----------

function setFont(px, weight = 400) {
  ctx.font = `${weight} ${px * dpr}px ui-monospace, Menlo, Consolas, monospace`;
}

function text(str, x, y, color = '#d8e1ee', align = 'left') {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(str, x * dpr, y * dpr);
}

function rect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * dpr, y * dpr, w * dpr, h * dpr);
}

function strokeRect(x, y, w, h, color, lw = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw * dpr;
  ctx.strokeRect(x * dpr, y * dpr, w * dpr, h * dpr);
}

function bar(x, y, w, h, value01, color) {
  rect(x, y, w, h, '#141a24');
  const fill = Math.max(0, Math.min(1, value01)) * w;
  rect(x, y, fill, h, color);
  strokeRect(x, y, w, h, '#222b3a');
}

function bins(x, y, w, h, values, color, { centerZero = false } = {}) {
  if (!values || !values.length) return;
  const n = values.length;
  const bw = w / n;
  rect(x, y, w, h, '#0f141d');
  if (centerZero) {
    // bipolar (e.g. MFCC)
    let max = 0;
    for (const v of values) max = Math.max(max, Math.abs(v));
    const scale = max || 1;
    const mid = y + h / 2;
    for (let i = 0; i < n; i++) {
      const v = values[i] / scale;
      const bh = (Math.abs(v) * h) / 2;
      const by = v >= 0 ? mid - bh : mid;
      rect(x + i * bw + 0.5, by, bw - 1, bh, color);
    }
    rect(x, mid - 0.5, w, 1, '#2a3344');
  } else {
    let max = 0;
    for (const v of values) max = Math.max(max, v);
    const scale = max || 1;
    for (let i = 0; i < n; i++) {
      const bh = (values[i] / scale) * h;
      rect(x + i * bw + 0.5, y + h - bh, bw - 1, bh, color);
    }
  }
  strokeRect(x, y, w, h, '#222b3a');
}

// ---------- main ----------

await createScene({
  onReady: (ctxInit) => {
    timeline = ctxInit.timeline;
    context = ctxInit;
    if (!timeline) {
      console.warn('[data-inspector] no timeline data — is the song fingerprinted?');
    }
  },
  onFrame: ({ t, frame, playing }) => {
    const W = window.innerWidth;
    const H = window.innerHeight;

    // backdrop
    ctx.fillStyle = '#07090d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ---------- header: song metadata ----------
    const pad = 16;
    let y = pad;

    setFont(18, 600);
    const title = timeline?.song_title || context?.songId || 'No song loaded';
    text(title, pad, y, '#ffffff');
    y += 26;

    setFont(11);
    const meta = [
      `BPM ${fmt(timeline?.bpm, 1)}`,
      `Key ${timeline?.key ?? '—'}`,
      `Duration ${fmtTime(timeline?.duration_s)}`,
      `Frame ${fmt(timeline?.resolution_ms, 1)} ms`,
      `Total frames ${timeline?.total_frames ?? '—'}`,
    ];
    text(meta.join('   ·   '), pad, y, '#7d8aa0');
    y += 20;

    // playhead + section
    setFont(12);
    const sectionLabel = frame?.section ?? '—';
    text(
      `t = ${fmtTime(t)}  ·  frame_idx ${frame?.frame_idx ?? '—'}  ·  section "${sectionLabel}"  ·  ${
        playing ? '▶ playing' : '⏸ paused'
      }`,
      pad,
      y,
      '#b8c4d6',
    );
    y += 22;

    // ---------- beat row ----------
    setFont(10, 600);
    text('BEAT', pad, y, '#7d8aa0');
    const beatY = y + 14;
    const dotR = 10;
    const dotGap = 30;
    const beatNum = frame?.beat?.beat_num ?? 0;
    const isDown = !!frame?.beat?.is_downbeat;
    for (let i = 1; i <= 4; i++) {
      const cx = pad + 50 + (i - 1) * dotGap;
      const active = i === beatNum;
      ctx.beginPath();
      ctx.arc(cx * dpr, (beatY + dotR / 2) * dpr, (dotR / 2) * dpr, 0, Math.PI * 2);
      ctx.fillStyle = active
        ? i === 1 && isDown
          ? '#ffd166'
          : '#7afcff'
        : '#1c2330';
      ctx.fill();
      ctx.strokeStyle = '#2a3344';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
    }
    setFont(10);
    const conf = frame?.beat?.confidence ?? 0;
    text(
      `bar ${frame?.beat?.bar_num ?? '—'}  beat ${frame?.beat?.beat_num ?? '—'}  conf ${fmt(conf)}  ${
        frame?.beat?.is_beat ? '· is_beat' : ''
      }${isDown ? ' · is_downbeat' : ''}`,
      pad + 50 + 4 * dotGap + 10,
      beatY + 1,
      '#b8c4d6',
    );
    y = beatY + 26;

    // ---------- section timeline strip ----------
    const stripH = 22;
    setFont(10, 600);
    text('SECTIONS', pad, y, '#7d8aa0');
    const stripY = y + 14;
    rect(pad, stripY, W - pad * 2, stripH, '#0f141d');
    strokeRect(pad, stripY, W - pad * 2, stripH, '#222b3a');

    const dur = timeline?.duration_s || 0;
    if (dur > 0 && timeline?.sections) {
      timeline.sections.forEach((s, i) => {
        const sx = pad + ((s.start_s / dur) * (W - pad * 2));
        const sw = ((s.end_s - s.start_s) / dur) * (W - pad * 2);
        const hue = (i * 67) % 360;
        rect(sx, stripY, sw, stripH, `hsl(${hue}, 45%, 28%)`);
        if (sw > 40) {
          setFont(9);
          ctx.save();
          ctx.beginPath();
          ctx.rect(sx * dpr, stripY * dpr, sw * dpr, stripH * dpr);
          ctx.clip();
          text(s.label, sx + 4, stripY + 6, `hsl(${hue}, 70%, 80%)`);
          ctx.restore();
        }
      });
      // playhead line
      const px = pad + (Math.min(t, dur) / dur) * (W - pad * 2);
      rect(px - 1, stripY - 4, 2, stripH + 8, '#ffffff');
    }
    y = stripY + stripH + 14;

    // ---------- per-stem columns ----------
    const colTop = y;
    const colW = (W - pad * 2 - 12 * 3) / 4;
    const colH = H - colTop - 30;

    STEMS.forEach((stem, ci) => {
      const x = pad + ci * (colW + 12);
      const stemColor = STEM_COLORS[stem];
      const stemFrame = frame?.stems?.[stem];
      const stemNorm = timeline?.normalization?.[stem];

      // header
      rect(x, colTop, colW, 22, '#0f141d');
      strokeRect(x, colTop, colW, 22, '#222b3a');
      setFont(11, 700);
      text(stem.toUpperCase(), x + 8, colTop + 5, stemColor);

      let cy = colTop + 28;

      // scalar feature bars
      setFont(9, 600);
      text('SCALARS  (raw  ·  normalized)', x, cy, '#5b6678');
      cy += 12;
      setFont(9);
      for (const feat of SCALAR_FEATURES) {
        const raw = stemFrame?.[feat];
        const stats = stemNorm?.[feat];
        const v01 = raw != null && stats ? norm(raw, stats) : 0;
        text(feat, x, cy, '#9aa6bb');
        text(fmt(raw), x + colW - 4, cy, '#7d8aa0', 'right');
        bar(x, cy + 12, colW, 6, v01, stemColor);
        if (stats) {
          setFont(8);
          text(
            `min ${fmt(stats.min)}  max ${fmt(stats.max)}  μ ${fmt(stats.mean)}`,
            x,
            cy + 20,
            '#4a5566',
          );
          setFont(9);
        }
        cy += 30;
      }

      // chroma 12
      cy += 4;
      setFont(9, 600);
      text('CHROMA  (12 pitch classes)', x, cy, '#5b6678');
      cy += 12;
      bins(x, cy, colW, 32, stemFrame?.chroma, stemColor);
      setFont(8);
      const chromaArr = stemFrame?.chroma;
      if (chromaArr && chromaArr.length === 12) {
        let maxIdx = 0;
        for (let i = 1; i < 12; i++) if (chromaArr[i] > chromaArr[maxIdx]) maxIdx = i;
        text(`dominant: ${PITCH_CLASSES[maxIdx]}`, x, cy + 34, '#7d8aa0');
      }
      cy += 48;

      // mfcc 13
      setFont(9, 600);
      text('MFCC  (13 coefficients, bipolar)', x, cy, '#5b6678');
      cy += 12;
      bins(x, cy, colW, 32, stemFrame?.mfcc, stemColor, { centerZero: true });
      cy += 38;

      // contrast 7
      setFont(9, 600);
      text('SPECTRAL CONTRAST  (7 bands)', x, cy, '#5b6678');
      cy += 12;
      bins(x, cy, colW, 24, stemFrame?.contrast, stemColor);
      cy += 30;
    });

    // footer hint
    setFont(9);
    text(
      'data-inspector template — every field in timeline.json shown live · see backend/musicviz/scenes/sdk/SDK.md',
      pad,
      H - 18,
      '#4a5566',
    );
  },
});
