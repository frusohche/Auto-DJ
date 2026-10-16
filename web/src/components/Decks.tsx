import { useEffect, useMemo, useRef } from 'react';
import { engine } from '../djEngine.ts';
import { fmt, useEngine, useFrame } from '../hooks.ts';
import { analyzeLyrics } from '../cuePoints.ts';
import { device } from '../device.ts';
import { describePlan as describe } from '../planLabel.ts';
import type { DeckId } from '../decks.ts';
import type { DJTrack } from '../types.ts';
import { TapTempo } from './TapTempo.tsx';

function Timeline({ track, songMs, markers }: { track: DJTrack; songMs: number; markers: { at: number; cls: string }[] }) {
  const sec = useMemo(() => analyzeLyrics(track.lyrics, track.durationMs), [track.lyrics, track.durationMs]);
  const pct = (ms: number) => `${Math.max(0, Math.min(100, (ms / track.durationMs) * 100))}%`;
  return (
    <div className="timeline">
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

function DeckPanel({ id, host }: { id: DeckId; host: React.RefObject<HTMLDivElement | null> }) {
  const snap = useEngine();
  const isActive = snap.active === id && snap.phase !== 'idle';
  const trackIndex = isActive ? snap.index : snap.plan?.toIndex;
  const track = trackIndex != null ? snap.tracks[trackIndex] : undefined;
  const { songMs, volume } = engine.deckTime(id);
  const markers =
    snap.plan && track
      ? isActive
        ? [{ at: snap.plan.mixOutMs, cls: 'out' }]
        : [{ at: snap.plan.startMs, cls: 'in' }]
      : [];

  return (
    <div className={`deck ${isActive ? 'active' : ''}`}>
      <div className="deck-label">
        Deck {id} <span className="muted small">{isActive ? 'on air' : track ? 'cued' : 'empty'}</span>
      </div>
      <div className="video-host" ref={host} />
      <div className="deck-info">
        <div className="title">{track?.title ?? '—'}</div>
        <div className="muted small">{track?.artists.join(', ')}</div>
      </div>
      {track && <Timeline track={track} songMs={songMs} markers={markers} />}
      <div className="deck-foot small">
        <span>{track ? `${fmt(songMs)} / ${fmt(track.durationMs)}` : ''}</span>
        {track && isActive && <TapTempo current={track.bpm} onBpm={(bpm) => engine.setBpm(track.id, bpm)} />}
        <div className="vu">
          <div style={{ width: `${volume * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

export function Decks() {
  const hostA = useRef<HTMLDivElement>(null);
  const hostB = useRef<HTMLDivElement>(null);
  const snap = useEngine();
  useFrame(snap.phase !== 'idle');

  useEffect(() => {
    void engine.attachDecks(hostA.current!, hostB.current!);
  }, []);

  const cur = snap.tracks[snap.index];
  const next = snap.plan ? snap.tracks[snap.plan.toIndex] : undefined;
  const songMs = engine.deckTime(snap.active).songMs;

  let status = 'Pick a playlist and press Start.';
  if (snap.phase === 'loading') status = 'Loading the first track…';
  else if (snap.phase === 'paused') status = 'Paused';
  else if (snap.phase === 'mixing' && next) status = `Mixing into ${next.title}…`;
  else if (snap.phase === 'playing' && snap.plan && next)
    status = `${describe(snap.plan, cur, snap.style.fadeBars)} into ${next.title} in ${fmt(snap.plan.mixOutMs - songMs)}`;
  else if (snap.phase === 'playing') status = 'Last track of the set';
  if (snap.message) status = snap.message;

  const needsUnlock = device.mobile && (!snap.unlocked.A || !snap.unlocked.B);
  const anyReady = snap.tracks.some((t) => t.status === 'ready');

  return (
    <div className="panel decks">
      {needsUnlock && (
        <div className="phone-note">
          <b>Playing on this phone (experimental).</b>{' '}
          {device.ios
            ? 'iPhones can’t fade YouTube volume, so changes will be cuts and drum bridges instead of blends. '
            : ''}
          Phones only let the app control a video after you tap it once:
          <ol>
            <li>
              <button disabled={!anyReady} onClick={() => engine.primeDecks()}>
                Load decks
              </button>{' '}
              {!anyReady && <span className="muted small">(waiting for songs to match)</span>}
            </li>
            <li>
              Tap ▶ inside <b>Deck A</b> {snap.unlocked.A ? '✅' : ''} and <b>Deck B</b> {snap.unlocked.B ? '✅' : ''}. They pause
              straight away.
            </li>
            <li>Press ▶ Start the mix.</li>
          </ol>
          <span className="muted small">
            For the full experience, play on a computer and use this phone as a remote (📱 Phone remote button at the top).
          </span>
        </div>
      )}
      <div className="deck-row">
        <DeckPanel id="A" host={hostA} />
        <DeckPanel id="B" host={hostB} />
      </div>
      <div className="transport">
        {snap.phase === 'paused' ? (
          <button className="primary" onClick={() => engine.resume()}>
            ▶ Resume
          </button>
        ) : (
          <button disabled={snap.phase !== 'playing' && snap.phase !== 'mixing'} onClick={() => engine.pause()}>
            ❚❚ Pause
          </button>
        )}
        <button disabled={snap.phase !== 'playing' || !snap.plan} onClick={() => engine.mixNow()}>
          ⇄ Mix now
        </button>
        <label className="vol">
          🔊
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={snap.masterVolume}
            onChange={(e) => engine.setMasterVolume(Number(e.target.value))}
          />
        </label>
        <span className="status">{status}</span>
      </div>
    </div>
  );
}
