import { create } from 'zustand';
import { api, openPipelineSocket } from '../api/client.js';

export const useStore = create((set, get) => ({
  projects: [],
  currentProject: null,
  songs: [],
  jobs: {}, // songId → { jobId, stage, overall, status, message, error }

  async loadProjects() {
    const projects = await api.listProjects();
    set({ projects });
  },

  async createProject(name) {
    const project = await api.createProject(name);
    set((s) => ({ projects: [...s.projects, project] }));
    return project;
  },

  async openProject(id) {
    const project = await api.getProject(id);
    const songs = await api.listSongs(id);
    set({ currentProject: project, songs });
  },

  async deleteProject(id) {
    await api.deleteProject(id);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      currentProject: s.currentProject?.id === id ? null : s.currentProject,
    }));
  },

  async addSong(file) {
    const project = get().currentProject;
    if (!project) return;
    const song = await api.addSong(project.id, file);
    set((s) => {
      if (s.songs.find((x) => x.id === song.id)) return s;
      return { songs: [...s.songs, song] };
    });
  },

  async removeSong(songId) {
    const project = get().currentProject;
    if (!project) return;
    await api.removeSong(project.id, songId);
    set((s) => ({ songs: s.songs.filter((x) => x.id !== songId) }));
  },

  async refreshSongs() {
    const project = get().currentProject;
    if (!project) return;
    const songs = await api.listSongs(project.id);
    set({ songs });
  },

  async startFingerprint(songId) {
    const project = get().currentProject;
    if (!project) return;
    const { job_id } = await api.startFingerprint(project.id, songId);
    set((s) => ({
      jobs: {
        ...s.jobs,
        [songId]: { jobId: job_id, stage: 'queued', overall: 0, status: 'running', message: '' },
      },
    }));
    const ws = openPipelineSocket(job_id, (evt) => {
      set((s) => ({
        jobs: {
          ...s.jobs,
          [songId]: {
            jobId: job_id,
            stage: evt.stage,
            overall: evt.overall,
            status: evt.status,
            message: evt.message,
            error: evt.error,
          },
        },
      }));
      if (evt.status === 'done' || evt.status === 'error') {
        ws.close();
        get().refreshSongs();
      }
    });
  },
}));
