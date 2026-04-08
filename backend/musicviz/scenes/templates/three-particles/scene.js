import * as THREE from 'three';
import { createScene } from '/api/scene-sdk.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 6;

const COUNT = 4000;
const positions = new Float32Array(COUNT * 3);
const basePositions = new Float32Array(COUNT * 3);
for (let i = 0; i < COUNT; i++) {
  const r = 1.5 + Math.random() * 1.5;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const x = r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.sin(phi) * Math.sin(theta);
  const z = r * Math.cos(phi);
  basePositions[i * 3 + 0] = x;
  basePositions[i * 3 + 1] = y;
  basePositions[i * 3 + 2] = z;
  positions[i * 3 + 0] = x;
  positions[i * 3 + 1] = y;
  positions[i * 3 + 2] = z;
}

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const mat = new THREE.PointsMaterial({
  color: 0xa78bfa,
  size: 0.04,
  transparent: true,
  opacity: 0.9,
});
const points = new THREE.Points(geo, mat);
scene.add(points);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

let drumStats = null;
let vocalCentroidStats = null;
let burst = 0;

function norm(v, s) {
  if (!s) return 0;
  return Math.max(0, Math.min(1, (v - s.min) / (s.max - s.min || 1)));
}

await createScene({
  onReady: ({ timeline }) => {
    drumStats = timeline?.normalization?.drums?.energy ?? null;
    vocalCentroidStats = timeline?.normalization?.vocals?.centroid ?? null;
  },
  onFrame: ({ frame }) => {
    if (frame?.beat?.is_beat) burst = Math.max(burst, 0.6 + frame.beat.confidence * 0.4);
    burst *= 0.9;

    const drumE = frame ? norm(frame.stems.drums.energy, drumStats) : 0;
    const voxC = frame ? norm(frame.stems.vocals.centroid, vocalCentroidStats) : 0;

    points.rotation.y += 0.002 + voxC * 0.02;
    points.rotation.x += 0.0005;

    const scale = 1 + drumE * 0.4 + burst * 0.5;
    const pos = geo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3 + 0] = basePositions[i * 3 + 0] * scale;
      pos[i * 3 + 1] = basePositions[i * 3 + 1] * scale;
      pos[i * 3 + 2] = basePositions[i * 3 + 2] * scale;
    }
    geo.attributes.position.needsUpdate = true;

    mat.color.setHSL(0.7 + voxC * 0.2, 0.7, 0.45 + burst * 0.3);

    renderer.render(scene, camera);
  },
});
