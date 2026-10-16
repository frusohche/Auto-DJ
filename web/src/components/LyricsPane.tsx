import { useRef, useState } from 'react';
import { engine } from '../djEngine.ts';
import { useEngine, useFrame } from '../hooks.ts';
import { LyricsView } from './LyricsView.tsx';

export function LyricsPane() {
  const snap = useEngine();
  const live = snap.phase !== 'idle';
  useFrame(live);
  const [sweep, setSweep] = useState(true);
  const pane = useRef<HTMLDivElement>(null);

  const focus = engine.lyricFocus();
  const track = live ? snap.tracks[focus.index] : undefined;
  const songMs = engine.deckTime(focus.deck).songMs;
  const upcoming = focus.upcoming != null ? snap.tracks[focus.upcoming] : undefined;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void pane.current?.requestFullscreen();
  };

  return (
    <div className="panel lyrics" ref={pane}>
      <div className="lyrics-head">
        <div>
          <h2>{track ? track.title : 'Sing-along'}</h2>
          {track && <span className="muted small">{track.artists.join(', ')}</span>}
        </div>
        <div className="row tight">
          {track?.lyrics && (
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
      {track ? (
        <LyricsView
          lines={track.lyrics}
          plain={track.plainLyrics}
          instrumental={track.instrumental}
          songMs={songMs}
          durationMs={track.durationMs}
          title={track.title}
          artist={track.artists[0] ?? ''}
          sweep={sweep}
        />
      ) : (
        <p className="muted center">Lyrics show up here once the mix starts, so you can sing along 🎤</p>
      )}
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
