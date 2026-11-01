import { describe, expect, it } from 'vitest';
import {
  crossfaderFromLevels,
  echoDelaySec,
  EQ_MIN,
  eqGainDb,
  filterFreqs,
  flatMixer,
  stemGain,
  xfadeGains,
} from './mixer.ts';
import { DJEngine } from './djEngine.ts';
import type { DeckId, DeckLike } from './decks.ts';
import type { DJTrack } from './types.ts';

describe('mixer maths', () => {
  it('kills an EQ band at the bottom of its range', () => {
    expect(eqGainDb(EQ_MIN)).toBeLessThan(-40);
    expect(eqGainDb(-6)).toBe(-6);
  });

  it('drives a low-pass to the left and a high-pass to the right, off in the middle', () => {
    expect(filterFreqs(0)).toEqual({ lp: 22000, hp: 10 });
    expect(filterFreqs(-1).lp).toBeCloseTo(100);
    expect(filterFreqs(-1).hp).toBe(10);
    expect(filterFreqs(1).hp).toBeCloseTo(10000);
    expect(filterFreqs(0.5).hp).toBeGreaterThan(100);
  });

  it('mutes and solos stems', () => {
    const m = flatMixer();
    m.stems.vocals.muted = true;
    expect(stemGain(m, 'vocals')).toBe(0);
    expect(stemGain(m, 'drums')).toBe(1);
    m.solo = 'drums';
    expect(stemGain(m, 'bass')).toBe(0);
    expect(stemGain(m, 'drums')).toBe(1);
  });

  it('keeps both decks at full in the middle of the crossfader', () => {
    expect(xfadeGains(0)).toEqual({ A: 1, B: 1 });
    expect(xfadeGains(-1).B).toBeCloseTo(0);
    expect(xfadeGains(1).A).toBeCloseTo(0);
    expect(crossfaderFromLevels(1, 0)).toBe(-1);
    expect(crossfaderFromLevels(0.5, 0.5)).toBe(0);
  });

  it('times the echo to a dotted eighth', () => {
    expect(echoDelaySec(120)).toBeCloseTo(0.375);
    expect(echoDelaySec(null)).toBeCloseTo((0.75 * 60) / 105);
  });
});

class FakeDeck implements DeckLike {
  videoId: string | null = null;
  offsetMs = 0;
  volume = 0;
  unlocked = true;
  playing = false;
  constructor(readonly id: DeckId) {}
  async load(videoId: string) {
    this.videoId = videoId;
    this.playing = false;
  }
  async prime() {}
  play() {
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  stop() {
    this.playing = false;
    this.videoId = null;
  }
  seekSong() {}
  songTimeMs() {
    return 10_000;
  }
  setOffset() {}
  setVolume(v: number) {
    this.volume = v;
  }
  isPlaying() {
    return this.playing;
  }
}

const track = (id: string): DJTrack => ({
  id,
  title: id,
  artists: ['x'],
  album: '',
  durationMs: 200_000,
  status: 'ready',
  candidates: [{ videoId: `vid${id}`.padEnd(11, '0'), title: '', channel: '', durationMs: 200_000, offsetMs: 0, score: 1 }],
  videoIdx: 0,
  lyrics: null,
  plainLyrics: null,
  instrumental: false,
  bpm: 110,
  keyOf: null,
  camelot: null,
  offsetAdjustMs: 0,
  errors: [],
});

describe('manual mode', () => {
  function setup() {
    const e = new DJEngine();
    const decks = { A: new FakeDeck('A'), B: new FakeDeck('B') };
    e.decks = decks;
    e.setTracks([track('1'), track('2'), track('3')]);
    return { e, decks };
  }

  it('lets the user load, play and crossfade without any automatic transition', () => {
    const { e, decks } = setup();
    e.setMode('manual');
    e.loadToDeck('A', 0);
    e.loadToDeck('B', 2);
    expect(e.getSnapshot().deckTrack).toEqual({ A: '1', B: '3' });
    e.deckPlay('A');
    expect(decks.A.playing).toBe(true);
    expect(e.getSnapshot()).toMatchObject({ phase: 'playing', active: 'A', index: 0, plan: null });

    e.setCrossfader(1);
    expect(decks.A.volume).toBeCloseTo(0);
    expect(decks.B.volume).toBeCloseTo(e.getSnapshot().masterVolume);
    expect(e.getSnapshot().plan).toBeNull();
  });

  it('loads a set-list jump onto the deck that is not playing', () => {
    const { e, decks } = setup();
    e.setMode('manual');
    e.loadToDeck('A', 0);
    e.deckPlay('A');
    e.jumpTo(1);
    expect(e.getSnapshot().deckTrack.B).toBe('2');
    expect(decks.A.playing).toBe(true);
  });

  it('hands back to the auto-mixer from the deck you can hear', () => {
    const { e, decks } = setup();
    e.setMode('manual');
    e.loadToDeck('B', 1);
    e.deckPlay('B');
    e.setMode('auto');
    expect(e.getSnapshot()).toMatchObject({ mode: 'auto', active: 'B', index: 1, phase: 'playing' });
    expect(e.getSnapshot().plan?.toIndex).toBe(2);
    expect(decks.B.volume).toBe(e.getSnapshot().masterVolume);
  });
});

describe('waveform bands', () => {
  const sine = (hz: number, sr: number, sec: number) => Float32Array.from({ length: sr * sec }, (_, i) => Math.sin((2 * Math.PI * hz * i) / sr));

  it('puts a bass tone in the low band and a hi-hat-like tone in the high band', async () => {
    const { computeBands } = await import('./waveform.ts');
    const sr = 22050;
    const bass = computeBands([sine(60, sr, 1)], sr);
    const hat = computeBands([sine(8000, sr, 1)], sr);
    const avg = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / a.length;
    // Normalised per band, so compare raw shape via a mixed signal instead.
    const mix = Float32Array.from(sine(60, sr, 2), (v, i) => (i < sr ? v : 0.5 * Math.sin((2 * Math.PI * 8000 * i) / sr)));
    const m = computeBands([mix], sr);
    const half = m.low.length / 2;
    expect(avg(m.low.slice(2, half - 2))).toBeGreaterThan(avg(m.low.slice(half + 2)));
    expect(avg(m.high.slice(half + 2))).toBeGreaterThan(avg(m.high.slice(2, half - 2)));
    expect(bass.low.length).toBe(80);
    expect(bass.durationSec).toBeCloseTo(1);
    expect(Math.max(...hat.high)).toBeCloseTo(1);
  });
});
