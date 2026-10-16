import type { Camelot } from './types.ts';

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parse a key like "F#m", "A♭", "Eb minor", "C major" into Camelot notation. */
export function parseKey(raw: string | null | undefined): Camelot | null {
  if (!raw) return null;
  const m = /^([A-Ga-g])\s*([#♯b♭]?)\s*(maj(?:or)?|m(?:in(?:or)?)?)?/.exec(raw.trim());
  if (!m) return null;
  const [, note, acc, quality] = m;
  let pc = PITCH[note.toUpperCase()];
  if (acc === '#' || acc === '♯') pc += 1;
  if (acc === 'b' || acc === '♭') pc -= 1;
  pc = (pc + 12) % 12;
  const minor = !!quality && !quality.startsWith('maj');
  const majorPc = minor ? (pc + 3) % 12 : pc; // relative major shares the wheel number
  const num = (((majorPc * 7) % 12) + 7) % 12 + 1;
  return { num, letter: minor ? 'A' : 'B' };
}

export const camelotLabel = (c: Camelot | null) => (c ? `${c.num}${c.letter}` : '—');

/** 0 = same key, 1 = harmonically compatible neighbour, higher = clashier. */
export function camelotDistance(a: Camelot, b: Camelot): number {
  const d = Math.abs(a.num - b.num);
  return Math.min(d, 12 - d) + (a.letter === b.letter ? 0 : 1);
}

/** Relative tempo difference, treating half/double time as a match (e.g. 70 vs 140). */
export function bpmDistance(a: number, b: number): number {
  return Math.min(...[1, 2, 0.5].map((r) => Math.abs(a * r - b) / b));
}

export const barsToMs = (bars: number, bpm: number) => (bars * 4 * 60000) / bpm;
