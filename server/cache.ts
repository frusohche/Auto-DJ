import fs from 'node:fs';
import path from 'node:path';

// Tiny JSON-file cache so each track only costs YouTube quota once.
const FILE = path.join(import.meta.dirname, 'cache.json');

let data: Record<string, unknown> = {};
try {
  data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  data = {};
}

let timer: NodeJS.Timeout | null = null;
function scheduleWrite() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    fs.writeFile(FILE, JSON.stringify(data), (err) => {
      if (err) console.error('cache write failed', err);
    });
  }, 500);
}

export function cacheGet<T>(key: string): T | undefined {
  return data[key] as T | undefined;
}

export function cacheSet<T>(key: string, value: T): T {
  data[key] = value;
  scheduleWrite();
  return value;
}
