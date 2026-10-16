export type TransitionType = 'blend' | 'cut' | 'sfx';
export type EnergyCurve = 'none' | 'build' | 'wave';

export interface MixStyle {
  id: string;
  name: string;
  description: string;
  /** How long each song plays before we start leaving it (song edit length). */
  minPlayMs: number;
  maxPlayMs: number;
  /** Blend length in bars, converted with the outgoing track's BPM. */
  fadeBars: number;
  /** Blend length when BPM is unknown. */
  fadeFallbackMs: number;
  weights: Record<TransitionType, number>;
  sfxEnabled: boolean;
  energyCurve: EnergyCurve;
}

// Hand-tuned to the feel of Afrobeats / Amapiano mixtape channels
// (Culture FM, DJ Kiki, DJ Faaji, DJ Mixeado): short song edits, hook-to-hook changes,
// quick cuts and sound effects. These are labels for the vibe, not their branding.
export const PRESETS: MixStyle[] = [
  {
    id: 'mixtape',
    name: 'Mixtape (hook to hook)',
    description: 'Verse + chorus of each song, 8-bar blends, the odd cut on the drop.',
    minPlayMs: 75_000,
    maxPlayMs: 150_000,
    fadeBars: 8,
    fadeFallbackMs: 10_000,
    weights: { blend: 0.7, cut: 0.2, sfx: 0.1 },
    sfxEnabled: true,
    energyCurve: 'build',
  },
  {
    id: 'amapiano',
    name: 'Amapiano long blend',
    description: 'Longer plays and 16-bar blends that ride the log drum.',
    minPlayMs: 150_000,
    maxPlayMs: 300_000,
    fadeBars: 16,
    fadeFallbackMs: 20_000,
    weights: { blend: 1, cut: 0, sfx: 0 },
    sfxEnabled: false,
    energyCurve: 'wave',
  },
  {
    id: 'party',
    name: 'Party (cuts + SFX)',
    description: 'Fast edits, 4-bar blends, lots of drops, horns and rewinds.',
    minPlayMs: 55_000,
    maxPlayMs: 110_000,
    fadeBars: 4,
    fadeFallbackMs: 5_000,
    weights: { blend: 0.4, cut: 0.3, sfx: 0.3 },
    sfxEnabled: true,
    energyCurve: 'build',
  },
];
