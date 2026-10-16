import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { cacheGet, cacheSet } from './cache.ts';
import { searchYouTube, type Candidate } from './youtube.ts';
import { fetchLyrics, type LyricsResult } from './lyrics.ts';
import { fetchBpm, type BpmResult } from './bpm.ts';

try {
  process.loadEnvFile(path.join(import.meta.dirname, '..', '.env'));
} catch {
  console.warn('No .env file found - copy .env.example to .env');
}

const YT_KEY = process.env.YOUTUBE_API_KEY ?? '';
const BPM_KEY = process.env.GETSONGBPM_API_KEY ?? '';
const PORT = Number(process.env.PORT ?? 5174);

const app = express();

export interface MatchResponse {
  candidates: Candidate[];
  lyrics: LyricsResult | null;
  bpm: BpmResult | null;
  errors: string[];
}

app.get('/api/match/:trackId', async (req, res) => {
  const { trackId } = req.params;
  const title = String(req.query.title ?? '');
  const artists = String(req.query.artists ?? '').split('|').filter(Boolean);
  const album = String(req.query.album ?? '');
  const durationMs = Number(req.query.durationMs ?? 0);
  const errors: string[] = [];

  async function part<T>(key: string, enabled: boolean, label: string, fn: () => Promise<T>): Promise<T | null> {
    const hit = cacheGet<T>(key);
    if (hit !== undefined) return hit;
    if (!enabled) {
      errors.push(`${label}: no API key configured`);
      return null;
    }
    try {
      return cacheSet(key, await fn());
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`);
      return null; // not cached, so it retries next time
    }
  }

  const [candidates, lyrics, bpm] = await Promise.all([
    part(`yt:${trackId}`, !!YT_KEY, 'YouTube', () => searchYouTube({ title, artists, durationMs }, YT_KEY)),
    part(`lyr:${trackId}`, true, 'Lyrics', () => fetchLyrics({ title, artist: artists[0] ?? '', album, durationMs })),
    part(`bpm:${trackId}`, !!BPM_KEY, 'BPM', () => fetchBpm(title, artists[0] ?? '', BPM_KEY)),
  ]);

  const body: MatchResponse = { candidates: candidates ?? [], lyrics, bpm, errors };
  res.json(body);
});

// Serve the production build when it exists (npm run build && npm start).
const dist = path.join(import.meta.dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`API on http://127.0.0.1:${PORT}`);
  if (!YT_KEY) console.warn('YOUTUBE_API_KEY missing - tracks will not get videos');
  if (!BPM_KEY) console.warn('GETSONGBPM_API_KEY missing - ordering will use lyrics/metadata only');
});
