import type { LyricLine } from './types.ts';
import type { MixStyle, TransitionType } from './styles.ts';
import { barsToMs } from './music.ts';

export interface Sections {
  vocalStartMs: number | null;
  vocalEndMs: number | null;
  /** Blocks of repeated lines - almost always the chorus/hook. */
  choruses: { startMs: number; endMs: number }[];
}

const LAST_LINE_MS = 4000;
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function analyzeLyrics(lines: LyricLine[] | null, durationMs: number): Sections {
  const sung = (lines ?? []).filter((l) => l.text);
  if (sung.length === 0) return { vocalStartMs: null, vocalEndMs: null, choruses: [] };

  const endOf = (i: number) => {
    const idx = lines!.indexOf(sung[i]);
    const next = lines![idx + 1];
    return Math.min(durationMs, next ? next.t : sung[i].t + LAST_LINE_MS);
  };

  const counts = new Map<string, number>();
  for (const l of sung) counts.set(norm(l.text), (counts.get(norm(l.text)) ?? 0) + 1);
  const repeated = sung.map((l) => norm(l.text).length > 3 && counts.get(norm(l.text))! >= 2);

  const choruses: Sections['choruses'] = [];
  for (let i = 0; i < sung.length; ) {
    if (!repeated[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < sung.length && repeated[j + 1]) j++;
    if (j > i) choruses.push({ startMs: sung[i].t, endMs: endOf(j) });
    i = j + 1;
  }

  return { vocalStartMs: sung[0].t, vocalEndMs: endOf(sung.length - 1), choruses };
}

export function fadeLength(style: MixStyle, type: TransitionType, outgoingBpm: number | null): number {
  if (type === 'cut') return outgoingBpm ? Math.max(250, 60000 / outgoingBpm) : 400; // ~1 beat
  if (type === 'sfx') return 300;
  const ms = outgoingBpm ? barsToMs(style.fadeBars, outgoingBpm) : style.fadeFallbackMs;
  return Math.min(32000, Math.max(3000, ms));
}

/** Where the incoming track should start (song time), so its vocals don't collide with the outgoing ones. */
export function incomingStart(sec: Sections, type: TransitionType, fadeMs: number): number {
  if (type === 'cut') return sec.choruses[0]?.startMs ?? sec.vocalStartMs ?? 0; // drop straight into the hook
  if (sec.vocalStartMs == null) return 0;
  if (type === 'sfx') return Math.max(0, sec.vocalStartMs - 2000);
  // Blend: the first vocal lands exactly as the fade completes.
  return Math.max(0, sec.vocalStartMs - fadeMs);
}

/** When to start leaving the outgoing track (song time): the first section boundary inside the play window. */
export function outgoingMixPoint(
  sec: Sections,
  durationMs: number,
  startMs: number,
  style: MixStyle,
  fadeMs: number,
): number {
  const latest = Math.max(startMs, durationMs - fadeMs - 1000);
  const minAt = startMs + style.minPlayMs;
  const maxAt = startMs + style.maxPlayMs;
  const boundaries = [...sec.choruses.map((c) => c.endMs), ...(sec.vocalEndMs != null ? [sec.vocalEndMs] : [])].sort(
    (a, b) => a - b,
  );
  const inWindow = boundaries.find((b) => b >= minAt && b <= maxAt && b <= latest);
  return Math.min(latest, inWindow ?? maxAt);
}
