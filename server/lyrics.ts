export interface LyricsResult {
  synced: string | null;
  plain: string | null;
  instrumental: boolean;
}

const BASE = 'https://lrclib.net/api';
const HEADERS = { 'User-Agent': 'auto-dj/0.1 (personal project)' };

interface LrclibRecord {
  syncedLyrics: string | null;
  plainLyrics: string | null;
  instrumental: boolean;
  duration: number;
}

const toResult = (r: LrclibRecord): LyricsResult => ({
  synced: r.syncedLyrics || null,
  plain: r.plainLyrics || null,
  instrumental: !!r.instrumental,
});

export async function fetchLyrics(q: {
  title: string;
  artist: string;
  album?: string;
  durationMs: number;
}): Promise<LyricsResult | null> {
  const params = new URLSearchParams({
    track_name: q.title,
    artist_name: q.artist,
    duration: String(Math.round(q.durationMs / 1000)),
  });
  if (q.album) params.set('album_name', q.album);

  const exact = await fetch(`${BASE}/get?${params}`, { headers: HEADERS });
  if (exact.ok) {
    const r = (await exact.json()) as LrclibRecord;
    if (r.syncedLyrics || r.plainLyrics || r.instrumental) return toResult(r);
  }

  // Fall back to fuzzy search; prefer synced lyrics with a close duration.
  const sr = await fetch(`${BASE}/search?${new URLSearchParams({ track_name: q.title, artist_name: q.artist })}`, {
    headers: HEADERS,
  });
  if (!sr.ok) return null;
  const list = (await sr.json()) as LrclibRecord[];
  const target = q.durationMs / 1000;
  const best = list
    .filter((r) => Math.abs(r.duration - target) < 10)
    .sort((a, b) => Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics) || Math.abs(a.duration - target) - Math.abs(b.duration - target))[0];
  return best ? toResult(best) : null;
}
