// Lightweight fetch wrapper. Vite proxies /api → backend.

const BASE = '/api';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export const api = {
  // Projects
  listProjects: () => req('GET', '/projects'),
  createProject: (name) => req('POST', '/projects', { name }),
  getProject: (id) => req('GET', `/projects/${id}`),
  deleteProject: (id) => req('DELETE', `/projects/${id}`),

  // Songs
  listSongs: (projectId) => req('GET', `/projects/${projectId}/songs`),
  addSong: async (projectId, file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/projects/${projectId}/songs`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }
    return res.json();
  },
  removeSong: (projectId, songId) =>
    req('DELETE', `/projects/${projectId}/songs/${songId}`),

  // Fingerprint
  startFingerprint: (projectId, songId) =>
    req('POST', `/projects/${projectId}/songs/${songId}/fingerprint`),
  fingerprintStatus: (projectId, songId) =>
    req('GET', `/projects/${projectId}/songs/${songId}/fingerprint`),
  getTimeline: (projectId, songId) =>
    req('GET', `/projects/${projectId}/songs/${songId}/timeline`),
  getAnalysis: (projectId, songId, kind) =>
    req('GET', `/projects/${projectId}/songs/${songId}/analysis/${kind}`),
  getWaveform: (projectId, songId, points = 1000) =>
    req('GET', `/projects/${projectId}/songs/${songId}/waveform?points=${points}`),

  // URLs (not fetched as JSON)
  audioUrl: (projectId, songId) => `${BASE}/projects/${projectId}/songs/${songId}/audio`,
  stemUrl: (projectId, songId, stem) =>
    `${BASE}/projects/${projectId}/songs/${songId}/stems/${stem}`,
};

export function openPipelineSocket(jobId, onEvent) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${window.location.host}/ws/pipeline/${jobId}`);
  ws.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data));
    } catch {
      // ignore malformed payloads
    }
  };
  return ws;
}
