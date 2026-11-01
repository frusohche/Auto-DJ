// Mixer settings for one deck, modelled on a 2-channel DJ mixer (Pioneer DJM / DDJ-FLX4 layout):
// trim, 3-band EQ with kills, a one-knob colour filter, echo, channel fader, and stem pads.

export const STEMS = ['vocals', 'drums', 'bass', 'other'] as const;
export type StemName = (typeof STEMS)[number];
export const STEM_LABEL: Record<StemName, string> = { vocals: 'VOX', drums: 'DRUMS', bass: 'BASS', other: 'MELODY' };

export interface StemCtl {
  level: number;
  muted: boolean;
}

export interface MixerState {
  /** dB, -12..+12 */
  trim: number;
  /** dB, EQ_MIN..EQ_MAX; EQ_MIN is a full kill. */
  hi: number;
  mid: number;
  low: number;
  /** -1 (low-pass) .. 0 (off) .. +1 (high-pass) */
  filter: number;
  /** Echo wet level, 0..1 */
  echo: number;
  /** Channel fader, 0..1 */
  fader: number;
  stems: Record<StemName, StemCtl>;
  solo: StemName | null;
}

export const TRIM_RANGE = 12;
export const EQ_MIN = -26;
export const EQ_MAX = 6;
const KILL_DB = -60;
const FILTER_DEAD_ZONE = 0.03;

export function flatMixer(): MixerState {
  return {
    trim: 0,
    hi: 0,
    mid: 0,
    low: 0,
    filter: 0,
    echo: 0,
    fader: 1,
    stems: { vocals: { level: 1, muted: false }, drums: { level: 1, muted: false }, bass: { level: 1, muted: false }, other: { level: 1, muted: false } },
    solo: null,
  };
}

export const dbToGain = (db: number) => 10 ** (db / 20);

/** EQ knob value to filter gain: all the way down is a kill. */
export const eqGainDb = (v: number) => (v <= EQ_MIN + 0.01 ? KILL_DB : v);

export function stemGain(m: MixerState, s: StemName): number {
  if (m.solo) return s === m.solo ? m.stems[s].level : 0;
  return m.stems[s].muted ? 0 : m.stems[s].level;
}

/** One knob drives both filters: left sweeps a low-pass down to 100 Hz, right a high-pass up to 10 kHz. */
export function filterFreqs(x: number): { lp: number; hp: number } {
  const t = Math.max(0, (Math.abs(x) - FILTER_DEAD_ZONE) / (1 - FILTER_DEAD_ZONE));
  return {
    lp: x < 0 && t > 0 ? 20000 * (100 / 20000) ** t : 22000,
    hp: x > 0 && t > 0 ? 20 * (10000 / 20) ** t : 10,
  };
}

/** Echo repeats every 3/4 of a beat (a dotted eighth), the classic DJ echo. */
export const echoDelaySec = (bpm: number | null) => (0.75 * 60) / (bpm && bpm > 0 ? bpm : 105);

/** Crossfader -1 (A) .. +1 (B); both decks are at full level in the middle, like a DJ mixer. */
export function xfadeGains(x: number): { A: number; B: number } {
  return {
    A: x <= 0 ? 1 : Math.cos((x * Math.PI) / 2),
    B: x >= 0 ? 1 : Math.cos((-x * Math.PI) / 2),
  };
}

/** Where a crossfader would sit for these deck levels (to show the auto-mix moving it). */
export function crossfaderFromLevels(a: number, b: number): number {
  const top = Math.max(a, b);
  return top < 0.001 ? 0 : (b - a) / top;
}

/** RMS to a 0..1 meter reading over a 48 dB range. */
export function meterLevel(rms: number): number {
  if (rms <= 0) return 0;
  return Math.max(0, Math.min(1, (20 * Math.log10(rms) + 48) / 48));
}
