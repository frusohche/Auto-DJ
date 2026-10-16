import type { BridgeFlavor, BridgeSounds } from './bridge.ts';

export type TransitionType = 'blend' | 'cut' | 'sfx' | 'bridge';
export type EnergyCurve = 'none' | 'build' | 'wave';

export interface BridgeSettings {
  /** Bars the drums play alone between the songs. */
  bars: number;
  flavor: BridgeFlavor | 'auto';
  sounds: BridgeSounds;
  /** Tempo used when a song has no BPM (no data and not tapped). */
  defaultBpm: number;
}

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
  bridge: BridgeSettings;
}

const ALL_SOUNDS: BridgeSounds = { drums: true, logPiano: true, bass: true };

// Hand-tuned to the feel of Afrobeats / Amapiano mixtape channels
// (Culture FM, DJ Kiki, DJ Faaji, DJ Mixeado): short song edits, hook-to-hook changes,
// drum bridges, quick cuts and sound effects. These are labels for the vibe, not their branding.
export const PRESETS: MixStyle[] = [
  {
    id: 'mixtape',
    name: 'Mixtape (hook to hook)',
    description: 'Verse + chorus of each song; 8-bar blends, drum bridges, the odd cut on the drop.',
    minPlayMs: 75_000,
    maxPlayMs: 150_000,
    fadeBars: 8,
    fadeFallbackMs: 10_000,
    weights: { blend: 0.45, cut: 0.15, sfx: 0.1, bridge: 0.3 },
    sfxEnabled: true,
    energyCurve: 'build',
    bridge: { bars: 4, flavor: 'auto', sounds: ALL_SOUNDS, defaultBpm: 105 },
  },
  {
    id: 'amapiano',
    name: 'Amapiano long blend',
    description: 'Longer plays, 16-bar blends and log-drum + piano bridges.',
    minPlayMs: 150_000,
    maxPlayMs: 300_000,
    fadeBars: 16,
    fadeFallbackMs: 20_000,
    weights: { blend: 0.55, cut: 0, sfx: 0, bridge: 0.45 },
    sfxEnabled: false,
    energyCurve: 'wave',
    bridge: { bars: 8, flavor: 'amapiano', sounds: ALL_SOUNDS, defaultBpm: 112 },
  },
  {
    id: 'party',
    name: 'Party (cuts + SFX)',
    description: 'Fast edits: 4-bar blends, short drum bridges, drops, horns and rewinds.',
    minPlayMs: 55_000,
    maxPlayMs: 110_000,
    fadeBars: 4,
    fadeFallbackMs: 5_000,
    weights: { blend: 0.3, cut: 0.25, sfx: 0.2, bridge: 0.25 },
    sfxEnabled: true,
    energyCurve: 'build',
    bridge: { bars: 2, flavor: 'afrobeats', sounds: ALL_SOUNDS, defaultBpm: 108 },
  },
];
