import { useEffect, useMemo, useRef } from 'react';
import { engine, type Plan } from '../djEngine.ts';
import { fmt, useEngine, useFrame } from '../hooks.ts';
import { analyzeLyrics } from '../cuePoints.ts';
import type { DeckId } from '../decks.ts';
import type { DJTrack } from '../types.ts';

function describe(plan: Plan, from: DJTrack | undefined, fadeBars: number): string {
  if (plan.type === 'cut') return 'cut on the drop';
  if (plan.type === 'sfx') return `${plan.sfx} + cut`;
  return from?.bpm && plan.fadeMs > 2000 ? `${fadeBars}-bar blend` : `${Math.round(plan.fadeMs / 1000)}s blend`;
}

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

  return (
    <div className="panel decks">
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
