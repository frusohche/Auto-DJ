import type { DJTrack } from './types.ts';
import type { EnergyCurve } from './styles.ts';
import { bpmDistance, camelotDistance } from './music.ts';

export const WEIGHTS = { key: 1, bpm: 12, energy: 2 };

/** Target position in [0,1] of the BPM range for set progress p in [0,1]. */
export function energyTarget(curve: EnergyCurve, p: number): number | null {
  if (curve === 'build') return p < 0.8 ? p / 0.8 : 1 - (p - 0.8) * 1.5; // warm up, peak, short cool-down
  if (curve === 'wave') return 0.5 - 0.5 * Math.cos(p * Math.PI * 4); // two peaks
  return null;
}

export function transitionCost(
  a: Pick<DJTrack, 'bpm' | 'camelot'>,
  b: Pick<DJTrack, 'bpm' | 'camelot'>,
): number {
  const key = a.camelot && b.camelot ? Math.min(camelotDistance(a.camelot, b.camelot), 4) : 1.5;
  const bpm = a.bpm && b.bpm ? Math.min(bpmDistance(a.bpm, b.bpm), 0.3) : 0.06;
  return WEIGHTS.key * key + WEIGHTS.bpm * bpm;
}

/** Greedy nearest-neighbour ordering starting from `tracks[0]`. Unknown BPM/key get a neutral cost. */
export function orderSet(tracks: DJTrack[], curve: EnergyCurve): DJTrack[] {
  if (tracks.length < 3) return tracks.slice();
  const bpms = tracks.map((t) => t.bpm).filter((b): b is number => !!b);
  const lo = Math.min(...bpms);
  const span = Math.max(1, Math.max(...bpms) - lo);

  const out = [tracks[0]];
  const left = tracks.slice(1);
  while (left.length) {
    const cur = out[out.length - 1];
    const target = energyTarget(curve, out.length / (tracks.length - 1));
    let best = 0;
    let bestCost = Infinity;
    left.forEach((cand, i) => {
      let cost = transitionCost(cur, cand);
      if (target != null && cand.bpm && bpms.length) cost += WEIGHTS.energy * Math.abs((cand.bpm - lo) / span - target);
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    });
    out.push(left.splice(best, 1)[0]);
  }
  return out;
}
