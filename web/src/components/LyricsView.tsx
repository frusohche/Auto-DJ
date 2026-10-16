import { useEffect, useRef } from 'react';
import { fmt } from '../hooks.ts';
import { activeLineIndex } from '../lrc.ts';
import type { LyricLine } from '../types.ts';

interface Props {
  lines: LyricLine[] | null;
  plain: string | null;
  instrumental: boolean;
  songMs: number;
  durationMs: number;
  title: string;
  artist: string;
  sweep: boolean;
}

/** Karaoke-style lyrics: current line big and sweeping, auto-scrolled. Shared by the desktop and the phone remote. */
export function LyricsView({ lines, plain, instrumental, songMs, durationMs, title, artist, sweep }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const currentEl = useRef<HTMLDivElement>(null);
  const idx = lines ? activeLineIndex(lines, songMs) : -1;

  useEffect(() => {
    // Scroll only inside the lyrics box (scrollIntoView would also scroll the page on phones).
    const box = scroller.current;
    const el = currentEl.current;
    if (!box || !el) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }, [idx, title]);

  // Plain (unsynced) lyrics: scroll in proportion to song progress.
  useEffect(() => {
    const el = scroller.current;
    if (!el || lines || !plain) return;
    el.scrollTop = (el.scrollHeight - el.clientHeight) * Math.min(1, songMs / durationMs);
  });

  if (lines) {
    const first = lines.find((l) => l.text);
    return (
      <div className="lyrics-scroll" ref={scroller}>
        {idx < 0 && first && <div className="lyric-line intro">♪ first line in {fmt(first.t - songMs)}</div>}
        {lines.map((l, i) => {
          const state = i === idx ? 'current' : i < idx ? 'past' : 'future';
          const end = lines[i + 1]?.t ?? l.t + 4000;
          const progress = i === idx ? Math.min(1, (songMs - l.t) / Math.max(1, end - l.t)) : 0;
          return (
            <div
              key={`${l.t}-${i}`}
              ref={i === idx ? currentEl : undefined}
              className={`lyric-line ${state} ${l.text ? '' : 'gap'}`}
              style={i === idx && sweep ? ({ '--p': `${progress * 100}%` } as React.CSSProperties) : undefined}
              data-sweep={i === idx && sweep && l.text ? '' : undefined}
            >
              {l.text || '♪'}
            </div>
          );
        })}
      </div>
    );
  }
  if (plain) {
    return (
      <div className="lyrics-scroll plain" ref={scroller}>
        {plain}
      </div>
    );
  }
  return (
    <p className="muted center">
      {instrumental ? 'Instrumental. No lyrics to sing.' : 'No lyrics found. '}
      {!instrumental && (
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(`${artist} ${title} lyrics`)}`}
          target="_blank"
          rel="noreferrer"
        >
          Search online
        </a>
      )}
    </p>
  );
}
