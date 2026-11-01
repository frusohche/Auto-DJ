// Song audio for the DJ board. The browser can't touch the sound inside a YouTube player, so the
// server fetches the matched video's audio (yt-dlp) and splits it into stems (Demucs: vocals, drums,
// bass, other). Everything is cached on disk. Without yt-dlp the app falls back to YouTube players.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { StemQueue } from './stemQueue.ts';

export const STEM_NAMES = ['vocals', 'drums', 'bass', 'other'] as const;
const ID = /^[\w-]{11}$/;
const AUDIO_EXT = /\.(m4a|webm|opus|mp3|ogg)$/;

const ROOT = path.join(import.meta.dirname, 'audio-cache');
const AUDIO_DIR = path.join(ROOT, 'audio');
const STEM_DIR = path.join(ROOT, 'stems');
const MODEL = 'htdemucs';
const PYTHON = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');

export const validVideoId = (id: string) => ID.test(id);

/** Run a command; resolves on exit code 0. `onStderr` sees output as it arrives. */
function run(cmd: string, args: string[], onStderr?: (chunk: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let tail = '';
    const p = spawn(cmd, args, { windowsHide: true });
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (chunk: string) => {
      tail = (tail + chunk).slice(-600);
      onStderr?.(chunk);
    });
    p.stdout.resume();
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited with ${code}: ${tail.trim().split('\n').pop() ?? ''}`)),
    );
  });
}

const works = (cmd: string, args: string[]) => run(cmd, args).then(() => true, () => false);

interface Tools {
  /** Command + leading args for yt-dlp, or null when it isn't installed. */
  ytdlp: string[] | null;
  demucs: boolean;
}

let toolsPromise: Promise<Tools> | null = null;
function tools(): Promise<Tools> {
  toolsPromise ??= (async () => {
    const options = [process.env.YTDLP_PATH ? [process.env.YTDLP_PATH] : ['yt-dlp'], [PYTHON, '-m', 'yt_dlp']];
    let ytdlp: string[] | null = null;
    for (const o of options) {
      if (await works(o[0], [...o.slice(1), '--version'])) {
        ytdlp = o;
        break;
      }
    }
    // Demucs reads m4a/webm through ffmpeg.
    const [demucs, ffmpeg] = await Promise.all([works(PYTHON, ['-m', 'demucs', '--help']), works('ffmpeg', ['-version'])]);
    const t = { ytdlp, demucs: demucs && ffmpeg };
    console.log(`DJ board audio: yt-dlp ${ytdlp ? 'found' : 'missing'}, stems ${t.demucs ? 'on' : `off (demucs ${demucs ? 'ok' : 'missing'}, ffmpeg ${ffmpeg ? 'ok' : 'missing'})`}`);
    return t;
  })();
  return toolsPromise;
}

function findAudio(id: string): string | null {
  try {
    const f = fs.readdirSync(AUDIO_DIR).find((n) => n.startsWith(`${id}.`) && AUDIO_EXT.test(n));
    return f ? path.join(AUDIO_DIR, f) : null;
  } catch {
    return null;
  }
}

const downloads = new Map<string, Promise<string>>();
/** Cap parallel downloads so a flood of requests (e.g. from someone else on the Wi-Fi) can't swamp the machine. */
const MAX_DOWNLOADS = 3;
export class BusyError extends Error {}

/** Download a video's audio once (best audio stream, no re-encode so ffmpeg isn't needed). */
export function fetchAudio(id: string): Promise<string> {
  const have = findAudio(id);
  if (have) return Promise.resolve(have);
  let p = downloads.get(id);
  if (!p) {
    if (downloads.size >= MAX_DOWNLOADS) return Promise.reject(new BusyError('Too many downloads at once'));
    p = (async () => {
      const { ytdlp } = await tools();
      if (!ytdlp) throw new Error('yt-dlp is not installed');
      fs.mkdirSync(AUDIO_DIR, { recursive: true });
      const out = path.join(AUDIO_DIR, `${id}.%(ext)s`);
      const [cmd, ...pre] = ytdlp;
      await run(cmd, [...pre, '-f', 'bestaudio[ext=m4a]/bestaudio', '--no-playlist', '-q', '-o', out, `https://www.youtube.com/watch?v=${id}`]);
      const file = findAudio(id);
      if (!file) throw new Error('yt-dlp finished but no audio file was written');
      return file;
    })().finally(() => downloads.delete(id));
    downloads.set(id, p);
  }
  return p;
}

const stemFile = (id: string, name: string) => path.join(STEM_DIR, MODEL, id, `${name}.mp3`);
const stemsDone = (id: string) => STEM_NAMES.every((s) => fs.existsSync(stemFile(id, s)));

// Error details (which can include local file paths) go to the server log, never to the browser.
const queue = new StemQueue(
  async (id, onProgress) => {
    try {
      const src = await fetchAudio(id);
      await run(PYTHON, ['-m', 'demucs', '-n', MODEL, '--mp3', '-o', STEM_DIR, src], (chunk) => {
        // tqdm progress: " 42%|████▏     | 25.0/58.5 [...]"
        const all = [...chunk.matchAll(/(\d{1,3})%\|/g)];
        if (all.length) onProgress(Number(all[all.length - 1][1]));
      });
      if (!stemsDone(id)) throw new Error('Demucs finished but the stems are missing');
    } catch (e) {
      console.error(`Stems for ${id} failed:`, (e as Error).message);
      throw new Error('splitting failed (details in the server log)');
    }
  },
  stemsDone,
);

export function audioRouter(): Router {
  const r = Router();

  r.get('/caps', async (_req, res) => {
    const t = await tools();
    res.json({ ytdlp: !!t.ytdlp, demucs: t.demucs });
  });

  r.param('id', (req, res, next, id: string) => {
    if (validVideoId(id)) return next();
    res.status(400).json({ error: 'Bad video id' });
  });

  r.get('/:id/full', async (req, res) => {
    try {
      res.sendFile(await fetchAudio(req.params.id));
    } catch (e) {
      if (e instanceof BusyError) return void res.status(429).json({ error: e.message });
      console.error(`Audio for ${req.params.id} failed:`, (e as Error).message);
      res.status(502).json({ error: 'Could not get the audio for this video' });
    }
  });

  r.post('/:id/stems', async (req, res) => {
    if (!(await tools()).demucs) return void res.json({ status: 'error', progress: 0, error: 'Demucs is not installed' });
    res.json(queue.request(req.params.id));
  });

  r.get('/:id/stems', (req, res) => {
    res.json(queue.status(req.params.id));
  });

  r.get('/:id/stem/:name', (req, res) => {
    const name = req.params.name;
    const file = stemFile(req.params.id, name);
    if (!(STEM_NAMES as readonly string[]).includes(name) || !fs.existsSync(file)) return void res.status(404).end();
    res.sendFile(file);
  });

  return r;
}
