// Per-track user tweaks, remembered in this browser.
export interface TrackPrefs {
  offsetAdjustMs?: number;
  customVideoId?: string;
  videoIdx?: number;
}

const KEY = 'autodj.trackPrefs';

function readAll(): Record<string, TrackPrefs> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export const getPrefs = (id: string): TrackPrefs => readAll()[id] ?? {};

export function setPrefs(id: string, patch: TrackPrefs) {
  try {
    const all = readAll();
    all[id] = { ...all[id], ...patch };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable - tweaks just won't persist */
  }
}

/** Extract a YouTube video id from a URL or bare id. */
export function parseVideoId(input: string): string | null {
  const s = input.trim();
  const m = /(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/.exec(s) ?? /^([\w-]{11})$/.exec(s);
  return m ? m[1] : null;
}
