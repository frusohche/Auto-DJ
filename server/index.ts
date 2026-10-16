import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { cacheGet, cacheSet } from './cache.ts';
import { searchYouTube, type Candidate } from './youtube.ts';
import { fetchLyrics, type LyricsResult } from './lyrics.ts';
import { fetchBpm, type BpmResult } from './bpm.ts';
import { roomsRouter } from './rooms.ts';

try {
  process.loadEnvFile(path.join(import.meta.dirname, '..', '.env'));
} catch {
  // Hosted deployments set real environment variables instead of a .env file.
}

const YT_KEY = process.env.YOUTUBE_API_KEY ?? '';
const BPM_KEY = process.env.GETSONGBPM_API_KEY ?? '';
const APP_PASSWORD = process.env.APP_PASSWORD ?? '';
const PORT = Number(process.env.PORT ?? 5174);
// Hosting platforms need 0.0.0.0; locally we stay on loopback.
const HOST = process.env.HOST ?? (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');

const app = express();
app.set('trust proxy', true);

export interface MatchResponse {
  candidates: Candidate[];
  lyrics: LyricsResult | null;
  bpm: BpmResult | null;
  errors: string[];
}

/** Optional shared password so strangers can't spend your YouTube quota on a public deployment. */
function requirePassword(req: Request, res: Response, next: NextFunction) {
  if (!APP_PASSWORD) return next();
  const given = Buffer.from(String(req.get('x-app-password') ?? ''));
  const want = Buffer.from(APP_PASSWORD);
  if (given.length === want.length && timingSafeEqual(given, want)) return next();
  res.status(401).json({ error: 'App password required' });
}

app.get('/api/config', (_req, res) => {
  res.json({ passwordRequired: !!APP_PASSWORD });
});

/** The computer's Wi-Fi/LAN addresses, so the phone-remote QR code can point at something a phone can reach. */
app.get('/api/lan', (_req, res) => {
  // Real Wi-Fi/Ethernet first; VPNs (Norton, Tailscale...), WSL/Hyper-V and other virtual adapters last.
  const virtual = /vpn|wireguard|tailscale|zerotier|vethernet|wsl|hyper-v|virtual|vmware|vbox|docker|loopback/i;
  const physical = /wi-?fi|wlan|ethernet|^en\d|^eth\d/i;
  const cgnat = (ip: string) => /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip); // 100.64/10, used by VPNs
  const rank = (name: string, ip: string) => (virtual.test(name) || cgnat(ip) ? 2 : physical.test(name) ? 0 : 1);
  const ips = Object.entries(os.networkInterfaces())
    .flatMap(([name, addrs]) =>
      (addrs ?? [])
        .filter((n) => n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.'))
        .map((n) => ({ ip: n.address, rank: rank(name, n.address) })),
    )
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.ip);
  res.json({ ips });
});

app.get('/api/check-password', requirePassword, (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/match/:trackId', requirePassword, async (req, res) => {
  const trackId = String(req.params.trackId);
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
    // v2: re-look-up after the title clean-up / artist check was added.
    part(`bpm2:${trackId}`, !!BPM_KEY, 'BPM', () => fetchBpm(title, artists[0] ?? '', BPM_KEY)),
  ]);

  const body: MatchResponse = { candidates: candidates ?? [], lyrics, bpm, errors };
  res.json(body);
});

app.post('/api/rooms', requirePassword);
app.use('/api/rooms', roomsRouter());

// Serve the production build when it exists (npm run build && npm start).
const dist = path.join(import.meta.dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, HOST, () => {
  console.log(`API on http://${HOST}:${PORT}`);
  if (!YT_KEY) console.warn('YOUTUBE_API_KEY missing - tracks will not get videos');
  if (!BPM_KEY) console.warn('GETSONGBPM_API_KEY missing - ordering will use lyrics/metadata only');
  if (!APP_PASSWORD && HOST !== '127.0.0.1') console.warn('APP_PASSWORD not set - anyone with the URL can use your API quota');
});
