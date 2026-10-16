import { useEffect, useRef, useState } from 'react';
import { engine } from '../djEngine.ts';
import { fmt, useEngine, useFrame } from '../hooks.ts';
import { activeLineIndex } from '../lrc.ts';

export function LyricsPane() {
  const snap = useEngine();
  const live = snap.phase !== 'idle';
  useFrame(live);
  const [sweep, setSweep] = useState(true);
  const pane = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const currentEl = useRef<HTMLDivElement>(null);

  const focus = engine.lyricFocus();
  const track = live ? snap.tracks[focus.index] : undefined;
  const songMs = engine.deckTime(focus.deck).songMs;
  const lines = track?.lyrics ?? null;
  const idx = lines ? activeLineIndex(lines, songMs) : -1;
  const upcoming = focus.upcoming != null ? snap.tracks[focus.upcoming] : undefined;

  useEffect(() => {
    currentEl.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [idx, track?.id]);

  // Plain (unsynced) lyrics: scroll in proportion to song progress.
  useEffect(() => {
    const el = scroller.current;
    if (!el || lines || !track?.plainLyrics) return;
    el.scrollTop = (el.scrollHeight - el.clientHeight) * Math.min(1, songMs / track.durationMs);
  });

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void pane.current?.requestFullscreen();
  };

  let body: React.ReactNode;
  if (!track) {
    body = <p className="muted center">Lyrics show up here once the mix starts, so you can sing along 🎤</p>;
  } else if (lines) {
    const first = lines.find((l) => l.text);
    body = (
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
  } else if (track.plainLyrics) {
    body = (
      <div className="lyrics-scroll plain" ref={scroller}>
        {track.plainLyrics}
      </div>
    );
  } else {
    body = (
      <p className="muted center">
        {track.instrumental ? 'Instrumental. No lyrics to sing.' : 'No lyrics found. '}
        {!track.instrumental && (
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(`${track.artists[0]} ${track.title} lyrics`)}`}
            target="_blank"
            rel="noreferrer"
          >
            Search online
          </a>
        )}
      </p>
    );
  }

  return (
    <div className="panel lyrics" ref={pane}>
      <div className="lyrics-head">
        <div>
          <h2>{track ? track.title : 'Sing-along'}</h2>
          {track && <span className="muted small">{track.artists.join(', ')}</span>}
        </div>
        <div className="row tight">
          {track && lines && (
            <>
              <button className="ghost small" title="Lyrics appear before the singing" onClick={() => engine.nudgeOffset(track.id, 500)}>
                Lyrics too early
              </button>
              <button className="ghost small" title="Lyrics appear after the singing" onClick={() => engine.nudgeOffset(track.id, -500)}>
                Lyrics too late
              </button>
              <label className="small check">
                <input type="checkbox" checked={sweep} onChange={(e) => setSweep(e.target.checked)} /> sweep
              </label>
            </>
          )}
          <button className="ghost small" onClick={toggleFullscreen}>
            ⛶ Full screen
          </button>
        </div>
      </div>
      {body}
      {upcoming && (
        <div className="upnext">
          <span className="muted small">Up next</span> <b>{upcoming.title}</b>
          {upcoming.lyrics?.find((l) => l.text) && (
            <span className="muted"> · “{upcoming.lyrics.find((l) => l.text)!.text}”</span>
          )}
        </div>
      )}
    </div>
  );
}
