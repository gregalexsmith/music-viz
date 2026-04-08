// MusicViz timeline.json — type definitions for scene authors.
// Mirrors backend/musicviz/pipeline/timeline.py.

export type StemName = 'vocals' | 'drums' | 'bass' | 'other';

export interface StemFeatures {
  /** RMS energy, 0..1ish (use normalization for true bounds). */
  energy: number;
  /** Spectral centroid in Hz. */
  centroid: number;
  /** Spectral bandwidth in Hz. */
  bandwidth: number;
  /** 7-band spectral contrast. */
  contrast: number[];
  /** Spectral rolloff in Hz. */
  rolloff: number;
  /** 12-bin chroma (C, C#, D, ..., B). */
  chroma: number[];
  /** 13 MFCC coefficients. */
  mfcc: number[];
  /** Onset strength at this frame. */
  onset: number;
  /** Zero-crossing rate. */
  zcr: number;
}

export interface BeatInfo {
  is_beat: boolean;
  is_downbeat: boolean;
  /** 1..4 within a 4/4 bar (null if no beat at this frame). */
  beat_num: number | null;
  /** 1-indexed bar number (null if no beat at this frame). */
  bar_num: number | null;
  /** 0..1 confidence from onset strength. */
  confidence: number;
}

export interface Frame {
  /** Time in seconds. */
  t: number;
  frame_idx: number;
  beat: BeatInfo;
  /** Section label (e.g. "verse_1") or null. */
  section: string | null;
  stems: Record<StemName, StemFeatures>;
}

export interface FeatureStats {
  min: number;
  max: number;
  mean: number;
  std: number;
}

export type StemNormalization = Record<
  'energy' | 'centroid' | 'bandwidth' | 'rolloff' | 'onset' | 'zcr',
  FeatureStats
>;

export interface Section {
  start_s: number;
  end_s: number;
  label: string;
}

export interface Timeline {
  version: string;
  song_id: string;
  song_title: string;
  duration_s: number;
  /** Milliseconds per frame, e.g. ~23.2. */
  resolution_ms: number;
  total_frames: number;
  bpm: number;
  /** Estimated key, e.g. "C", "C#m". */
  key: string;
  sections: Section[];
  /** Per-stem min/max/mean/std for normalizing values to 0..1 in scenes. */
  normalization: Record<StemName, StemNormalization>;
  frames: Frame[];
}

// SDK surface ---------------------------------------------------------------

export interface SceneInitContext {
  timeline: Timeline | null;
  stemUrls: Record<StemName, string>;
  audioUrl: string;
  songId: string;
  projectId: string;
}

export interface FrameTickContext {
  /** Master clock time in seconds. */
  t: number;
  /** Timeline frame at `t`, or null if before the song starts. */
  frame: Frame | null;
  /** Whether the parent <audio> element is currently playing. */
  playing: boolean;
  timeline: Timeline | null;
}

export interface SceneHandlers {
  onReady?: (ctx: SceneInitContext) => void | Promise<void>;
  onFrame?: (ctx: FrameTickContext) => void;
  onResize?: (ctx: { width: number; height: number }) => void;
}

export interface SceneHandle {
  ready: () => Promise<SceneInitContext>;
  frameAt: (t: number) => Frame | null;
  readonly timeline: Timeline | null;
  readonly context: SceneInitContext | null;
}

export function createScene(handlers?: SceneHandlers): Promise<SceneHandle>;
