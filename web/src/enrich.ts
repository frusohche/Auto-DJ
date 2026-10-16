import type { Candidate, DJTrack, Track } from './types.ts';
import { parseLrc } from './lrc.ts';
import { parseKey } from './music.ts';
import { getPrefs } from './trackPrefs.ts';

interface MatchResponse {
  candidates: Candidate[];
  lyrics: { synced: string | null; plain: string | null; instrumental: boolean } | null;
  bpm: { bpm: number | null; keyOf: string | null } | null;
  errors: string[];
}

export function toDJTrack(t: Track): DJTrack {
  const p = getPrefs(t.id);
  return {
    ...t,
    status: 'pending',
    candidates: [],
    videoIdx: p.videoIdx ?? 0,
    customVideoId: p.customVideoId,
    lyrics: null,
    plainLyrics: null,
    instrumental: false,
    bpm: null,
    keyOf: null,
    camelot: null,
    offsetAdjustMs: p.offsetAdjustMs ?? 0,
    errors: [],
  };
}

async function matchOne(t: DJTrack): Promise<Partial<DJTrack>> {
  const q = new URLSearchParams({
    title: t.title,
    artists: t.artists.join('|'),
    album: t.album,
    durationMs: String(t.durationMs),
  });
  const res = await fetch(`/api/match/${t.id}?${q}`);
  if (!res.ok) throw new Error(`match ${res.status}`);
  const m: MatchResponse = await res.json();
  const lyrics = m.lyrics?.synced ? parseLrc(m.lyrics.synced) : null;
  return {
    status: m.candidates.length || t.customVideoId ? 'ready' : 'error',
    candidates: m.candidates,
    videoIdx: Math.min(t.videoIdx, Math.max(0, m.candidates.length - 1)),
    lyrics: lyrics?.length ? lyrics : null,
    plainLyrics: m.lyrics?.plain ?? null,
    instrumental: m.lyrics?.instrumental ?? false,
    bpm: m.bpm?.bpm ?? null,
    keyOf: m.bpm?.keyOf ?? null,
    camelot: parseKey(m.bpm?.keyOf),
    errors: m.errors,
  };
}

/** Fetch YouTube/lyrics/BPM for every track, a few at a time. */
export async function enrichAll(
  tracks: DJTrack[],
  update: (id: string, patch: Partial<DJTrack>) => void,
  concurrency = 3,
): Promise<void> {
  const queue = tracks.filter((t) => t.status === 'pending' || t.status === 'error');
  async function worker() {
    for (let t = queue.shift(); t; t = queue.shift()) {
      update(t.id, { status: 'loading' });
      try {
        update(t.id, await matchOne(t));
      } catch (e) {
        update(t.id, { status: 'error', errors: [(e as Error).message] });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}
