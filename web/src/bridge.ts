// "Bridge" transitions: a small drum machine + synth (Web Audio, nothing sampled) that
// plays between two songs - Afrobeats drums or Amapiano log drum + piano, with a bassline -
// while the tempo glides from the outgoing song's BPM to the incoming one's.
import type { Camelot } from './types.ts';
import { camelotRoot } from './music.ts';
import { audioContext } from './sfx.ts';

export type BridgeFlavor = 'afrobeats' | 'amapiano';

export interface BridgeSounds {
  drums: boolean;
  logPiano: boolean;
  bass: boolean;
}

export interface BridgeStart {
  bpm: number;
  flavor: BridgeFlavor;
  sounds: BridgeSounds;
  /** Key for the piano/bass; the incoming song's when known. */
  key: Camelot | null;
  /** Play a drum fill in the bar that starts at/after this many ms from now. */
  fillAfterMs: number;
}

// 16 steps per bar.
const AFRO = {
  kick: [0, 6, 8],
  clap: [4, 12],
  rim: [3, 10, 14],
  hat: [2, 6, 10, 14],
  conga: [7, 11, 15],
  bass: [0, 3, 8, 10],
  bassNotes: [0, 0, 7, 12],
};
const PIANO = {
  kick: [0, 4, 8, 12],
  clap: [4, 12],
  log: [3, 6, 10, 11, 14],
  logNotes: [0, 0, 7, 5, 0],
  stabs: [0, 6, 10],
  bass: [0, 8],
  bassNotes: [0, 7],
};
// Chord tones (semitones above the key root) for a 4-bar loop.
const MINOR_CHORDS = [
  [0, 3, 7, 10, 14],
  [5, 8, 12, 15, 19],
  [8, 12, 15, 19],
  [7, 10, 14, 17],
];
const MAJOR_CHORDS = [
  [0, 4, 7, 11],
  [9, 12, 16, 19],
  [2, 5, 9, 12],
  [7, 11, 14, 17],
];
const CHORD_ROOTS_MINOR = [0, 5, 8, 7];
const CHORD_ROOTS_MAJOR = [0, 9, 2, 7];

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class BridgePlayer {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private opts: BridgeStart | null = null;
  private step = 0;
  private bar = 0;
  private nextStepAt = 0;
  private fillFrom = Infinity;
  private fillBar = -1;
  private noise: AudioBuffer | null = null;
  private tempo = { from: 110, to: 110, start: 0, end: 0 };

  get playing() {
    return this.timer != null;
  }

  start(opts: BridgeStart) {
    this.stop();
    const ctx = audioContext();
    this.ctx = ctx;
    this.opts = opts;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(ctx.destination);
    this.noise ??= this.makeNoise(ctx);
    this.step = 0;
    this.bar = 0;
    this.fillBar = -1;
    this.nextStepAt = ctx.currentTime + 0.05;
    this.fillFrom = ctx.currentTime + opts.fillAfterMs / 1000;
    this.tempo = { from: opts.bpm, to: opts.bpm, start: 0, end: 0 };
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  /** Glide the tempo to `bpm` over `ms`. */
  rampTempo(bpm: number, ms: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.tempo = { from: this.bpmAt(now), to: bpm, start: now, end: now + ms / 1000 };
  }

  setGain(v: number) {
    if (!this.ctx || !this.out) return;
    this.out.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, 0.03);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.out && this.ctx) {
      const out = this.out;
      out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      setTimeout(() => out.disconnect(), 500);
    }
    this.out = null;
  }

  private bpmAt(t: number) {
    const { from, to, start, end } = this.tempo;
    if (t <= start || end <= start) return t <= start ? from : to;
    if (t >= end) return to;
    return from + ((t - start) / (end - start)) * (to - from);
  }

  private schedule() {
    const ctx = this.ctx!;
    while (this.nextStepAt < ctx.currentTime + 0.12) {
      const t = this.nextStepAt;
      if (this.step === 0 && this.fillBar < 0 && t >= this.fillFrom) this.fillBar = this.bar;
      this.playStep(t, this.step, this.bar);
      this.nextStepAt += 60 / this.bpmAt(t) / 4;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  private playStep(t: number, s: number, bar: number) {
    const o = this.opts!;
    const key = o.key ? camelotRoot(o.key) : { pc: 9, minor: true }; // A minor if unknown
    const chordIdx = bar % 4;
    const chordRoot = key.pc + (key.minor ? CHORD_ROOTS_MINOR : CHORD_ROOTS_MAJOR)[chordIdx];
    const isFill = bar === this.fillBar;
    const has = (arr: number[]) => arr.includes(s);

    if (o.sounds.drums) {
      if (isFill && s >= 8) {
        this.rim(t, 0.25 + ((s - 8) / 8) * 0.5); // snare-roll build into the next song
        if (s === 15) this.clap(t, 0.6);
      } else if (o.flavor === 'afrobeats') {
        if (has(AFRO.kick)) this.kick(t, 0.9);
        if (has(AFRO.clap)) this.clap(t, 0.45);
        if (has(AFRO.rim)) this.rim(t, 0.35);
        if (has(AFRO.hat)) this.hat(t, 0.18);
        if (has(AFRO.conga)) this.conga(t, s === 15 ? 330 : 220, 0.4);
      } else {
        if (has(PIANO.kick)) this.kick(t, 0.75);
        if (has(PIANO.clap)) this.clap(t, 0.3);
      }
      this.shaker(t, s % 2 === 1 ? 0.16 : 0.08);
    }

    if (o.flavor === 'amapiano' && o.sounds.logPiano) {
      const i = PIANO.log.indexOf(s);
      if (i >= 0 && !(isFill && s >= 12)) this.logDrum(t, midiHz(36 + ((chordRoot + PIANO.logNotes[i]) % 12)), 0.7);
      if (has(PIANO.stabs)) {
        const chord = (key.minor ? MINOR_CHORDS : MAJOR_CHORDS)[chordIdx];
        this.piano(t, chord.map((n) => midiHz(57 + ((key.pc + n) % 24) - 12)), s === 0 ? 1.2 : 0.35);
      }
    }

    if (o.sounds.bass && !(o.flavor === 'amapiano' && o.sounds.logPiano)) {
      const pat = o.flavor === 'afrobeats' ? AFRO : PIANO;
      const i = pat.bass.indexOf(s);
      if (i >= 0) this.bass(t, midiHz(33 + ((chordRoot + pat.bassNotes[i]) % 24)), 0.5);
    }
  }

  // ---- instruments ----
  private makeNoise(ctx: AudioContext) {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private env(t: number, peak: number, decay: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(this.out!);
    return g;
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, glide: number, peak: number, decay: number) {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    o.connect(this.env(t, peak, decay));
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, peak: number, decay: number) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    src.connect(f).connect(this.env(t, peak, decay));
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  private kick(t: number, v: number) {
    this.tone(t, 'sine', 150, 45, 0.12, v, 0.45);
  }
  private clap(t: number, v: number) {
    this.noiseHit(t, 'bandpass', 1500, v, 0.18);
    this.noiseHit(t + 0.012, 'bandpass', 1200, v * 0.7, 0.15);
  }
  private rim(t: number, v: number) {
    this.tone(t, 'triangle', 820, 800, 0.01, v, 0.06);
    this.noiseHit(t, 'highpass', 3000, v * 0.5, 0.04);
  }
  private hat(t: number, v: number) {
    this.noiseHit(t, 'highpass', 8000, v, 0.05);
  }
  private shaker(t: number, v: number) {
    this.noiseHit(t, 'highpass', 6000, v, 0.07);
  }
  private conga(t: number, f: number, v: number) {
    this.tone(t, 'sine', f * 1.3, f, 0.03, v, 0.22);
  }
  private logDrum(t: number, f: number, v: number) {
    // The Amapiano log drum: a pitched, gliding, slightly overdriven bass hit.
    this.tone(t, 'sine', f * 2, f, 0.06, v, 0.55);
    this.tone(t, 'triangle', f * 2.01, f * 1.01, 0.06, v * 0.35, 0.3);
  }
  private piano(t: number, freqs: number[], decay: number) {
    for (const f of freqs) {
      this.tone(t, 'triangle', f, f, 0, 0.09, decay);
      this.tone(t, 'sine', f * 2, f * 2, 0, 0.03, decay * 0.6);
    }
  }
  private bass(t: number, f: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.25);
    o.connect(lp).connect(this.env(t, v, 0.32));
    o.start(t);
    o.stop(t + 0.4);
  }
}

export const bridge = new BridgePlayer();
