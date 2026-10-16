export interface BpmResult {
  bpm: number | null;
  /** Musical key as GetSongBPM reports it, e.g. "F#m" or "A♭". */
  keyOf: string | null;
}

const BASE = process.env.GETSONGBPM_BASE ?? 'https://api.getsong.co';

interface SongRecord {
  id: string;
  title: string;
  tempo?: string;
  key_of?: string;
  artist?: { name: string };
}

/** Spotify titles carry extras ("(feat. X)", "- Remastered") that make GetSongBPM's exact search miss. */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([](feat|ft|with)\.?[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*$/, '')
    .trim();
}

const simple = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export async function fetchBpm(title: string, artist: string, apiKey: string): Promise<BpmResult | null> {
  const lookup = `song:${cleanTitle(title)} artist:${artist}`;
  const sr = await fetch(`${BASE}/search/?api_key=${apiKey}&type=both&lookup=${encodeURIComponent(lookup)}`);
  if (!sr.ok) throw new Error(`GetSongBPM ${sr.status}`);
  const sj = (await sr.json()) as { search: SongRecord[] | { error: string } };
  if (!Array.isArray(sj.search) || sj.search.length === 0) return null;

  // Guard against a same-titled song by someone else.
  const want = simple(artist);
  let song = sj.search.find((s) => {
    const got = simple(s.artist?.name ?? '');
    return got && (got.includes(want) || want.includes(got));
  });
  if (!song) return null;
  if (!song.tempo) {
    const dr = await fetch(`${BASE}/song/?api_key=${apiKey}&id=${song.id}`);
    if (dr.ok) song = ((await dr.json()) as { song: SongRecord }).song ?? song;
  }
  const bpm = Number(song.tempo);
  return { bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null, keyOf: song.key_of || null };
}
