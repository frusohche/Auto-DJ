import type { LyricLine } from '../types.ts';
import type { Phase } from '../djEngine.ts';

export interface RemoteTrack {
  id: string;
  title: string;
  artists: string[];
  image?: string;
  durationMs: number;
  bpm: number | null;
  key: string;
  ready: boolean;
}

export interface RemoteLyrics {
  lines: LyricLine[] | null;
  plain: string | null;
  instrumental: boolean;
}

/** What the computer publishes to phones (~1/s, plus on every change). */
export interface RemoteState {
  phase: Phase;
  index: number;
  /** Track whose lyrics are showing, and its song position when sent. */
  focusIndex: number;
  focusSongMs: number;
  upcoming: number | null;
  nextIndex: number | null;
  planLabel: string | null;
  /** ms until the next transition starts, when sent. */
  mixInMs: number | null;
  styleId: string;
  styles: { id: string; name: string }[];
  masterVolume: number;
  tracks: RemoteTrack[];
  /** Lyrics for the focus and upcoming tracks only, to keep messages small. */
  lyrics: Record<string, RemoteLyrics>;
}

export type RemoteCommand =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'mixNow' }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'autoOrder' }
  | { type: 'jumpTo'; trackId: string }
  | { type: 'move'; trackId: string; delta: -1 | 1 }
  | { type: 'style'; id: string }
  | { type: 'volume'; value: number }
  | { type: 'bpm'; trackId: string; bpm: number }
  | { type: 'nudge'; trackId: string; deltaMs: number };
