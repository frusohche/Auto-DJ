import { getAccessToken, logout } from './auth.ts';
import type { Track } from './types.ts';

const BASE = 'https://api.spotify.com/v1';

export class SpotifyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function api<T>(pathOrUrl: string): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new SpotifyError(401, 'Not logged in');
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : BASE + pathOrUrl;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    const wait = Number(res.headers.get('Retry-After') ?? 2);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return api(pathOrUrl);
  }
  if (res.status === 401) {
    logout();
    location.reload();
  }
  if (!res.ok) throw new SpotifyError(res.status, `Spotify ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

interface Page<T> {
  items: T[];
  next: string | null;
}

async function all<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  while (next) {
    const page: Page<T> = await api<Page<T>>(next);
    out.push(...page.items);
    next = page.next;
  }
  return out;
}

export interface Playlist {
  id: string;
  name: string;
  image?: string;
  trackCount: number;
  owner: string;
}

interface SpotifyImage {
  url: string;
}

export const getMe = () => api<{ id: string; display_name: string }>('/me');

export async function getPlaylists(): Promise<Playlist[]> {
  type Raw = {
    id: string;
    name: string;
    images: SpotifyImage[] | null;
    owner: { display_name: string };
    tracks?: { total: number };
    items?: { total: number };
  };
  const raw = await all<Raw | null>('/me/playlists?limit=50');
  return raw
    .filter((p): p is Raw => !!p)
    .map((p) => ({
      id: p.id,
      name: p.name,
      image: p.images?.[0]?.url,
      trackCount: p.items?.total ?? p.tracks?.total ?? 0,
      owner: p.owner.display_name,
    }));
}

/** Accepts a playlist ID, open.spotify.com URL or spotify: URI. */
export function parsePlaylistId(input: string): string | null {
  const m = /playlist[/:]([A-Za-z0-9]{22})/.exec(input) ?? /^([A-Za-z0-9]{22})$/.exec(input.trim());
  return m ? m[1] : null;
}

export async function getPlaylistTracks(id: string): Promise<Track[]> {
  type RawTrack = {
    id: string | null;
    type: string;
    is_local?: boolean;
    name: string;
    duration_ms: number;
    artists: { name: string }[];
    album: { name: string; images: SpotifyImage[] };
  };
  type RawItem = { track?: RawTrack | null; item?: RawTrack | null };

  // Newer API versions expose /items (with `item`); older ones /tracks (with `track`).
  let items: RawItem[];
  try {
    items = await all<RawItem>(`/playlists/${id}/items?limit=50&additional_types=track`);
  } catch (e) {
    if (!(e instanceof SpotifyError) || e.status === 401) throw e;
    items = await all<RawItem>(`/playlists/${id}/tracks?limit=50&additional_types=track`);
  }

  const seen = new Set<string>();
  const out: Track[] = [];
  for (const it of items) {
    const t = it.item ?? it.track;
    if (!t || !t.id || t.is_local || t.type !== 'track' || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push({
      id: t.id,
      title: t.name,
      artists: t.artists.map((a) => a.name),
      album: t.album.name,
      durationMs: t.duration_ms,
      image: t.album.images.at(-1)?.url ?? t.album.images[0]?.url,
    });
  }
  return out;
}
