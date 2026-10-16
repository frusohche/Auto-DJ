import type { LyricLine } from './types.ts';

const STAMP = /\[(\d+):(\d+(?:\.\d+)?)\]/g;

/** Parse LRC text ("[01:23.45] line") into time-sorted lines. Empty lines mark instrumental gaps. */
export function parseLrc(text: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(STAMP)];
    if (stamps.length === 0) continue;
    const content = raw.replace(STAMP, '').trim();
    for (const m of stamps) {
      out.push({ t: Math.round((Number(m[1]) * 60 + Number(m[2])) * 1000), text: content });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Index of the line being sung at time t, or -1 before the first line. */
export function activeLineIndex(lines: LyricLine[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
