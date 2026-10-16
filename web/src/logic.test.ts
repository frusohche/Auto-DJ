import { describe, expect, it } from 'vitest';
import { bpmDistance, camelotDistance, camelotLabel, camelotRoot, foldBpm, parseKey } from './music.ts';
import { activeLineIndex, parseLrc } from './lrc.ts';
import { analyzeLyrics, bridgeTotalMs, fadeLength, incomingStart, outgoingMixPoint, planBridge } from './cuePoints.ts';
import { orderSet } from './ordering.ts';
import { PRESETS } from './styles.ts';
import type { DJTrack } from './types.ts';

describe('music', () => {
  it('maps keys to Camelot', () => {
    expect(camelotLabel(parseKey('C'))).toBe('8B');
    expect(camelotLabel(parseKey('Am'))).toBe('8A');
    expect(camelotLabel(parseKey('F#m'))).toBe('11A');
    expect(camelotLabel(parseKey('E♭'))).toBe('5B');
    expect(camelotLabel(parseKey('Bb minor'))).toBe('3A');
    expect(camelotLabel(parseKey('B'))).toBe('1B');
    expect(parseKey('???')).toBeNull();
  });

  it('measures harmonic distance around the wheel', () => {
    expect(camelotDistance({ num: 8, letter: 'A' }, { num: 8, letter: 'B' })).toBe(1);
    expect(camelotDistance({ num: 12, letter: 'A' }, { num: 1, letter: 'A' })).toBe(1);
    expect(camelotDistance({ num: 2, letter: 'B' }, { num: 8, letter: 'B' })).toBe(6);
  });

  it('treats half/double time as matching', () => {
    expect(bpmDistance(70, 140)).toBe(0);
    expect(bpmDistance(112, 110)).toBeCloseTo(0.018, 3);
  });
});

const LRC = `[ar:Someone]
[00:12.00] Verse line one
[00:16.00] Verse line two
[00:20.00] Hook goes like this
[00:24.00] Everybody sing the hook
[00:28.00]
[00:40.00] Second verse here
[00:44.00] Hook goes like this
[00:48.00] Everybody sing the hook
[00:52.00] Outro words`;

describe('lrc + cues', () => {
  const lines = parseLrc(LRC);

  it('parses timestamps and skips metadata', () => {
    expect(lines[0]).toEqual({ t: 12000, text: 'Verse line one' });
    expect(lines).toHaveLength(9);
    expect(activeLineIndex(lines, 5000)).toBe(-1);
    expect(activeLineIndex(lines, 21000)).toBe(2);
  });

  it('finds vocals and repeated hook blocks', () => {
    const s = analyzeLyrics(lines, 60000);
    expect(s.vocalStartMs).toBe(12000);
    expect(s.vocalEndMs).toBe(56000);
    expect(s.choruses).toEqual([
      { startMs: 20000, endMs: 28000 },
      { startMs: 44000, endMs: 52000 },
    ]);
  });

  it('starts a blend so the first vocal lands as the fade completes', () => {
    const s = analyzeLyrics(lines, 60000);
    expect(incomingStart(s, 'blend', 8000)).toBe(4000);
    expect(incomingStart(s, 'cut', 400)).toBe(20000);
    expect(incomingStart(analyzeLyrics(null, 60000), 'blend', 8000)).toBe(0);
  });

  it('leaves at the first section boundary inside the play window', () => {
    const s = analyzeLyrics(lines, 200000);
    const style = { ...PRESETS[0], minPlayMs: 25000, maxPlayMs: 100000 };
    expect(outgoingMixPoint(s, 200000, 0, style, 8000)).toBe(28000);
    // No boundary in window -> maxAt, clamped so the fade fits before the end.
    expect(outgoingMixPoint(analyzeLyrics(null, 90000), 90000, 0, style, 8000)).toBe(81000);
  });

  it('converts bars to a fade length', () => {
    expect(fadeLength(PRESETS[0], 'blend', 120)).toBe(16000);
    expect(fadeLength(PRESETS[0], 'blend', null)).toBe(10000);
  });
});

describe('ordering', () => {
  const t = (id: string, bpm: number | null, key: string | null): DJTrack =>
    ({ id, bpm, camelot: parseKey(key) }) as DJTrack;

  it('chains compatible keys and tempos greedily', () => {
    const set = [t('a', 100, 'Am'), t('far', 140, 'F#'), t('near', 101, 'Em'), t('mid', 104, 'C')];
    expect(orderSet(set, 'none').map((x) => x.id)).toEqual(['a', 'near', 'mid', 'far']);
  });

  it('keeps every track and tolerates unknown data', () => {
    const set = [t('a', null, null), t('b', 110, null), t('c', null, 'Dm'), t('d', 95, 'G')];
    const out = orderSet(set, 'build');
    expect(out[0].id).toBe('a');
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});


describe('bridges', () => {
  it('inverts Camelot back to a root note', () => {
    expect(camelotRoot({ num: 8, letter: 'A' })).toEqual({ pc: 9, minor: true }); // A minor
    expect(camelotRoot({ num: 8, letter: 'B' })).toEqual({ pc: 0, minor: false }); // C major
    for (const k of ['F#m', 'Eb', 'Bbm', 'G', 'C#m']) {
      const c = parseKey(k)!;
      const { pc, minor } = camelotRoot(c);
      expect(parseKey(`${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][pc]}${minor ? 'm' : ''}`)).toEqual(c);
    }
  });

  it('folds half/double-time tempos into the mixing range', () => {
    expect(foldBpm(210)).toBe(105);
    expect(foldBpm(56)).toBe(112);
    expect(foldBpm(118)).toBe(118);
  });

  it('plans out / solo / in sections and picks the flavour by tempo', () => {
    const style = { ...PRESETS[0], bridge: { ...PRESETS[0].bridge, bars: 4, flavor: 'auto' as const } };
    const p = planBridge(style, 100, 100);
    expect(p.flavor).toBe('afrobeats');
    expect(p.outMs).toBe(1200); // half a bar at 100 BPM
    expect(p.soloMs).toBe(9600); // 4 bars
    expect(p.inMs).toBe(4800); // 2 bars
    expect(bridgeTotalMs(p)).toBe(15600);
    expect(planBridge(style, 112, 114).flavor).toBe('amapiano');
    expect(planBridge(style, null, null).fromBpm).toBe(style.bridge.defaultBpm);
  });
});
