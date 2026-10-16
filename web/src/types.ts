export interface Track {
  id: string;
  title: string;
  artists: string[];
  album: string;
  durationMs: number;
  image?: string;
}

export interface Candidate {
  videoId: string;
  title: string;
  channel: string;
  durationMs: number;
  offsetMs: number;
  score: number;
}

export interface LyricLine {
  /** Song time in ms. */
  t: number;
  text: string;
}

export interface Camelot {
  num: number;
  letter: 'A' | 'B';
}

export type EnrichStatus = 'pending' | 'loading' | 'ready' | 'error';

export interface DJTrack extends Track {
  status: EnrichStatus;
  candidates: Candidate[];
  videoIdx: number;
  /** User-pasted video that overrides the search results. */
  customVideoId?: string;
  lyrics: LyricLine[] | null;
  plainLyrics: string | null;
  instrumental: boolean;
  bpm: number | null;
  keyOf: string | null;
  camelot: Camelot | null;
  /** Manual timing nudge (ms) added to the video offset; shifts both lyrics and cues. */
  offsetAdjustMs: number;
  errors: string[];
}

export interface VideoRef {
  videoId: string;
  offsetMs: number;
}

export function videoFor(t: DJTrack): VideoRef | null {
  if (t.customVideoId) return { videoId: t.customVideoId, offsetMs: t.offsetAdjustMs };
  const c = t.candidates[t.videoIdx];
  return c ? { videoId: c.videoId, offsetMs: c.offsetMs + t.offsetAdjustMs } : null;
}
