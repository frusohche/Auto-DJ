import { useMemo } from 'react';
import { analyzeLyrics } from '../cuePoints.ts';
import type { DJTrack } from '../types.ts';

/** Song overview: vocal and chorus sections, mix/cue markers and the playhead. Click to seek when `onSeek` is set. */
export function Timeline({
  track,
  songMs,
  markers,
  onSeek,
}: {
  track: DJTrack;
  songMs: number;
  markers: { at: number; cls: string }[];
  onSeek?: (ms: number) => void;
}) {
  const sec = useMemo(() => analyzeLyrics(track.lyrics, track.durationMs), [track.lyrics, track.durationMs]);
  const pct = (ms: number) => `${Math.max(0, Math.min(100, (ms / track.durationMs) * 100))}%`;
  return (
    <div
      className={`timeline ${onSeek ? 'seekable' : ''}`}
      onClick={
        onSeek &&
        ((e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - r.left) / r.width) * track.durationMs);
        })
      }
    >
      {sec.vocalStartMs != null && sec.vocalEndMs != null && (
        <div className="seg vocal" style={{ left: pct(sec.vocalStartMs), right: `calc(100% - ${pct(sec.vocalEndMs)})` }} />
      )}
      {sec.choruses.map((c) => (
        <div key={c.startMs} className="seg chorus" style={{ left: pct(c.startMs), right: `calc(100% - ${pct(c.endMs)})` }} />
      ))}
      {markers.map((m) => (
        <div key={m.cls} className={`marker ${m.cls}`} style={{ left: pct(m.at) }} />
      ))}
      <div className="playhead" style={{ left: pct(songMs) }} />
    </div>
  );
}
