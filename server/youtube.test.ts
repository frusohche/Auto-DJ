import { describe, expect, it } from 'vitest';
import { estimateOffset, parseIsoDuration, scoreCandidate } from './youtube.ts';

const track = { title: 'Calm Down', artists: ['Rema'], durationMs: 239_000 };

describe('youtube matching', () => {
  it('parses ISO-8601 durations', () => {
    expect(parseIsoDuration('PT3M59S')).toBe(239_000);
    expect(parseIsoDuration('PT1H2M')).toBe(3_720_000);
  });

  it('prefers the Topic/official audio upload with a matching length', () => {
    const topic = scoreCandidate({ title: 'Calm Down', channel: 'Rema - Topic', durationMs: 239_500 }, track);
    const video = scoreCandidate(
      { title: 'Rema - Calm Down (Official Music Video)', channel: 'Rema', durationMs: 262_000 },
      track,
    );
    const cover = scoreCandidate({ title: 'Calm Down cover (live)', channel: 'Some Singer', durationMs: 240_000 }, track);
    expect(topic).toBeGreaterThan(video);
    expect(video).toBeGreaterThan(cover);
  });

  it('estimates a music-video intro offset only for longer video uploads', () => {
    expect(estimateOffset({ title: 'Calm Down (Official Video)', channel: 'Rema', durationMs: 249_000 }, 239_000)).toBe(8000);
    expect(estimateOffset({ title: 'Calm Down', channel: 'Rema - Topic', durationMs: 249_000 }, 239_000)).toBe(0);
  });
});
