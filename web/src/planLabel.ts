import type { Plan } from './djEngine.ts';
import type { DJTrack } from './types.ts';

/** Human description of an upcoming transition, e.g. "8-bar blend" or "Afro drums bridge (102→110 BPM)". */
export function describePlan(plan: Plan, from: DJTrack | undefined, fadeBars: number): string {
  if (plan.type === 'cut') return 'cut on the drop';
  if (plan.type === 'sfx') return `${plan.sfx} + cut`;
  if (plan.bridge) {
    const b = plan.bridge;
    const tempo =
      Math.round(b.fromBpm) === Math.round(b.toBpm) ? `${Math.round(b.fromBpm)}` : `${Math.round(b.fromBpm)}→${Math.round(b.toBpm)}`;
    return `${b.flavor === 'amapiano' ? 'log drum + piano' : 'Afro drums'} bridge (${tempo} BPM)`;
  }
  return from?.bpm && plan.fadeMs > 2000 ? `${fadeBars}-bar blend` : `${Math.round(plan.fadeMs / 1000)}s blend`;
}
