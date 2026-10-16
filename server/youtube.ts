export interface TrackQuery {
  title: string;
  artists: string[];
  durationMs: number;
}

export interface Candidate {
  videoId: string;
  title: string;
  channel: string;
  durationMs: number;
  /** Estimated ms of extra material before the song starts (music-video intros). */
  offsetMs: number;
  score: number;
}

const API = 'https://www.googleapis.com/youtube/v3';
const UNWANTED = /\b(live|cover|remix|slowed|sped ?up|8d|reverb|karaoke|instrumental|nightcore|reaction|mashup|loop|1 hour)\b/i;

export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return (((d * 24 + h) * 60 + min) * 60 + s) * 1000;
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\((feat|ft|with)[^)]*\)|\[(feat|ft|with)[^\]]*\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter(Boolean));
}

/** Fraction of the wanted tokens that appear in the candidate text. */
export function coverage(wanted: string, text: string): number {
  const w = tokens(wanted);
  if (w.size === 0) return 0;
  const t = tokens(text);
  let hit = 0;
  for (const x of w) if (t.has(x)) hit++;
  return hit / w.size;
}

export function scoreCandidate(
  c: { title: string; channel: string; durationMs: number },
  track: TrackQuery,
): number {
  let s = 0;
  const title = c.title.toLowerCase();
  const isTopic = / - topic$/i.test(c.channel);
  if (isTopic) s += 3;
  if (title.includes('official audio') || title.includes('audio')) s += 2;
  else if (title.includes('lyric')) s += 1;
  else if (title.includes('official video') || title.includes('music video')) s += 0.5;

  if (UNWANTED.test(c.title) && !UNWANTED.test(track.title)) s -= 4;

  const diff = Math.abs(c.durationMs - track.durationMs) / 1000;
  s += diff < 3 ? 3 : diff < 8 ? 1.5 : diff < 25 ? 0 : -3;

  s += 4 * coverage(track.title, c.title);
  const artistText = `${c.title} ${c.channel}`;
  s += 2 * Math.max(0, ...track.artists.map((a) => coverage(a, artistText)));
  return s;
}

/** Music videos often have skits before the song; guess that the extra length is at the start. */
export function estimateOffset(c: { title: string; channel: string; durationMs: number }, trackMs: number): number {
  const extra = c.durationMs - trackMs;
  const audioOnly = / - topic$/i.test(c.channel) || /audio|lyric/i.test(c.title);
  if (audioOnly || extra < 2000 || extra > 45000) return 0;
  return Math.round(extra * 0.8);
}

export async function searchYouTube(track: TrackQuery, apiKey: string): Promise<Candidate[]> {
  const q = `${track.artists[0] ?? ''} - ${track.title} official audio`;
  const searchUrl = `${API}/search?part=snippet&type=video&videoEmbeddable=true&maxResults=8&q=${encodeURIComponent(q)}&key=${apiKey}`;
  const sr = await fetch(searchUrl);
  if (!sr.ok) throw new Error(`YouTube search ${sr.status}: ${(await sr.text()).slice(0, 200)}`);
  const sj = (await sr.json()) as { items: { id: { videoId: string } }[] };
  const ids = sj.items.map((i) => i.id.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  const vr = await fetch(`${API}/videos?part=snippet,contentDetails,status&id=${ids.join(',')}&key=${apiKey}`);
  if (!vr.ok) throw new Error(`YouTube videos ${vr.status}`);
  const vj = (await vr.json()) as {
    items: {
      id: string;
      snippet: { title: string; channelTitle: string };
      contentDetails: { duration: string };
      status: { embeddable: boolean };
    }[];
  };

  return vj.items
    .filter((v) => v.status.embeddable)
    .map((v) => {
      const c = {
        videoId: v.id,
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        durationMs: parseIsoDuration(v.contentDetails.duration),
      };
      return { ...c, offsetMs: estimateOffset(c, track.durationMs), score: scoreCandidate(c, track) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
