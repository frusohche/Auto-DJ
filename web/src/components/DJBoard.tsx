import { useEffect, useRef, useState } from 'react';
import { engine } from '../djEngine.ts';
import { fmt, useEngine, useFrame } from '../hooks.ts';
import { device } from '../device.ts';
import { describePlan as describe } from '../planLabel.ts';
import { masterLevel } from '../audioDeck.ts';
import type { DeckId } from '../decks.ts';
import {
  crossfaderFromLevels,
  EQ_MAX,
  EQ_MIN,
  flatMixer,
  STEM_LABEL,
  STEMS,
  TRIM_RANGE,
  type MixerState,
  type StemName,
} from '../mixer.ts';
import { Timeline } from './Timeline.tsx';
import { Waveform } from './Waveform.tsx';
import { useWaveform } from '../waveform.ts';
import { videoFor } from '../types.ts';
import { TapTempo } from './TapTempo.tsx';
import { Knob } from './Knob.tsx';
import { Vu } from './Vu.tsx';

// The DJ board, laid out like a 2-deck controller (Pioneer DDJ-FLX4 style):
// Deck A | mixer (trim, HI/MID/LOW, filter, echo, meter, channel fader) | Deck B, then crossfader + master.

const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
const eq = (v: number) => (v <= EQ_MIN + 0.01 ? 'KILL' : db(v));
const pct = (v: number) => `${Math.round(v * 100)}%`;
const filt = (v: number) => (Math.abs(v) < 0.03 ? 'OFF' : `${v < 0 ? 'LPF' : 'HPF'} ${Math.round(Math.abs(v) * 100)}%`);

function StemPads({ id }: { id: DeckId }) {
  const snap = useEngine();
  const m = snap.mixers[id];
  const st = snap.stems[id];
  const ready = st.status === 'ready';
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);

  const toggleMute = (s: StemName) =>
    engine.setMixer(id, { stems: { ...m.stems, [s]: { ...m.stems[s], muted: !m.stems[s].muted } }, solo: null });
  const toggleSolo = (s: StemName) => engine.setMixer(id, { solo: m.solo === s ? null : s });

  let note = '';
  if (st.status === 'off') note = 'Install Demucs on the server to split songs into instruments.';
  else if (st.status === 'queued') note = 'Waiting to split…';
  else if (st.status === 'working') note = `Splitting into instruments… ${st.progress}%`;
  else if (st.status === 'error') note = `Couldn't split: ${st.error ?? 'unknown error'}`;
  else if (ready) note = 'Click to mute · Shift-click or hold to solo';

  return (
    <div className="stems">
      <div className="stems-head small">
        <b>Instruments</b> <span className="muted">{note}</span>
      </div>
      {st.status === 'working' && (
        <div className="stems-progress">
          <div style={{ width: `${st.progress}%` }} />
        </div>
      )}
      <div className="stem-row">
        {STEMS.map((s) => {
          const soloed = m.solo === s;
          const silent = m.stems[s].muted || (m.solo != null && !soloed);
          return (
            <div key={s} className="stem">
              <button
                className={`pad ${soloed ? 'solo' : silent ? 'muted' : 'on'}`}
                disabled={!ready}
                aria-pressed={!silent}
                title={`${STEM_LABEL[s]}: click to mute, Shift-click or hold to solo`}
                onPointerDown={() => {
                  const lp = { fired: false, timer: setTimeout(() => ((lp.fired = true), toggleSolo(s)), 450) };
                  longPress.current = lp;
                }}
                onPointerUp={() => longPress.current && clearTimeout(longPress.current.timer)}
                onPointerLeave={() => longPress.current && clearTimeout(longPress.current.timer)}
                onClick={(e) => {
                  if (longPress.current?.fired) return;
                  if (e.shiftKey) toggleSolo(s);
                  else toggleMute(s);
                }}
              >
                {STEM_LABEL[s]}
              </button>
              <input
                type="range"
                className="fader mini"
                min={0}
                max={1}
                step={0.01}
                value={m.stems[s].level}
                disabled={!ready}
                aria-label={`${STEM_LABEL[s]} level`}
                onChange={(e) => engine.setMixer(id, { stems: { ...m.stems, [s]: { ...m.stems[s], level: Number(e.target.value) } } })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeckUnit({ id, host }: { id: DeckId; host: React.RefObject<HTMLDivElement | null> }) {
  const snap = useEngine();
  const [pick, setPick] = useState('');
  const manual = snap.mode === 'manual';
  const processed = snap.audioMode === 'processed';
  const track = snap.tracks.find((t) => t.id === snap.deckTrack[id]);
  const playing = engine.decks?.[id].isPlaying() ?? false;
  const onAir = !manual && snap.phase !== 'idle' && snap.active === id;
  const { songMs } = engine.deckTime(id);
  const video = track ? videoFor(track) : null;
  const wave = useWaveform(processed ? video?.videoId : null);

  const markers: { at: number; cls: string }[] = [];
  if (manual && track) markers.push({ at: snap.cues[id], cls: 'cue' });
  else if (snap.plan && track) {
    if (onAir) markers.push({ at: snap.plan.mixOutMs, cls: 'out' });
    else if (snap.tracks[snap.plan.toIndex]?.id === track.id) markers.push({ at: snap.plan.startMs, cls: 'in' });
  }

  const badge = manual ? (playing ? 'playing' : track ? 'loaded' : 'empty') : onAir ? 'on air' : track ? 'up next' : 'empty';
  const loadLabel = manual ? 'Load' : onAir || snap.phase === 'idle' ? 'Play now' : 'Up next';
  const choices = snap.tracks.filter((t) => t.status === 'ready');

  return (
    <div className={`deck-unit ${onAir || (manual && playing) ? 'live' : ''}`}>
      <div className="deck-label">
        Deck {id} <span className="badge">{badge}</span>
      </div>
      <div className="video-host" ref={host} hidden={snap.audioMode !== 'youtube'} />
      <div className="deck-track">
        {track?.image ? <img src={track.image} alt="" /> : <div className="ph sm" />}
        <div className="deck-info">
          <div className="title">{track?.title ?? '—'}</div>
          <div className="muted small">{track?.artists.join(', ')}</div>
        </div>
      </div>
      {track && wave && video ? (
        <Waveform
          track={track}
          data={wave}
          songMs={songMs}
          offsetMs={video.offsetMs}
          markers={markers}
          live={onAir || (manual && playing)}
          onSeek={manual ? (ms) => engine.seekDeck(id, ms) : undefined}
        />
      ) : (
        track && <Timeline track={track} songMs={songMs} markers={markers} onSeek={manual ? (ms) => engine.seekDeck(id, ms) : undefined} />
      )}
      <div className="deck-foot small">
        <span>{track ? `${fmt(songMs)} / ${fmt(track.durationMs)}` : ''}</span>
        {track && <TapTempo current={track.bpm} onBpm={(bpm) => engine.setBpm(track.id, bpm)} />}
      </div>
      <div className="deck-load">
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label={`Song for deck ${id}`}>
          <option value="">Choose a song…</option>
          {choices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} · {t.artists[0]}
            </option>
          ))}
        </select>
        <button
          disabled={!pick}
          onClick={() => {
            engine.loadToDeck(id, snap.tracks.findIndex((t) => t.id === pick));
            setPick('');
          }}
        >
          {loadLabel}
        </button>
      </div>
      {manual && (
        <div className="deck-transport">
          <button className="cue-btn" disabled={!track} onClick={() => engine.deckCue(id)} title="Paused: set cue here. Playing: back to cue.">
            CUE
          </button>
          <button
            className={`play-btn ${playing ? 'on' : ''}`}
            disabled={!track}
            onClick={() => (playing ? engine.deckPause(id) : engine.deckPlay(id))}
            aria-label={playing ? `Pause deck ${id}` : `Play deck ${id}`}
          >
            {playing ? '❚❚' : '▶'}
          </button>
        </div>
      )}
      {processed && <StemPads id={id} />}
    </div>
  );
}

function Strip({ id }: { id: DeckId }) {
  const snap = useEngine();
  const m = snap.mixers[id];
  const set = (patch: Partial<MixerState>) => engine.setMixer(id, patch);
  return (
    <div className="strip">
      <div className="strip-name">{id}</div>
      <Knob label="TRIM" value={m.trim} min={-TRIM_RANGE} max={TRIM_RANGE} def={0} format={db} onChange={(v) => set({ trim: v })} />
      <Knob label="HI" value={m.hi} min={EQ_MIN} max={EQ_MAX} def={0} format={eq} danger={m.hi <= EQ_MIN + 0.01} onChange={(v) => set({ hi: v })} />
      <Knob label="MID" value={m.mid} min={EQ_MIN} max={EQ_MAX} def={0} format={eq} danger={m.mid <= EQ_MIN + 0.01} onChange={(v) => set({ mid: v })} />
      <Knob label="LOW" value={m.low} min={EQ_MIN} max={EQ_MAX} def={0} format={eq} danger={m.low <= EQ_MIN + 0.01} onChange={(v) => set({ low: v })} />
      <Knob label="FILTER" value={m.filter} min={-1} max={1} def={0} format={filt} onChange={(v) => set({ filter: v })} />
      <Knob label="ECHO" value={m.echo} min={0} max={1} def={0} format={pct} onChange={(v) => set({ echo: v })} />
      <div className="strip-fader">
        <Vu level={engine.deckLevel(id)} label={`Deck ${id} level`} />
        <input
          type="range"
          className="fader"
          min={0}
          max={1}
          step={0.01}
          value={m.fader}
          aria-label={`Channel ${id} fader`}
          onChange={(e) => set({ fader: Number(e.target.value) })}
        />
      </div>
      <button className="small ghost" onClick={() => engine.setMixer(id, flatMixer())} title="Set this channel back to flat">
        Reset
      </button>
    </div>
  );
}

export function DJBoard() {
  const hostA = useRef<HTMLDivElement>(null);
  const hostB = useRef<HTMLDivElement>(null);
  const snap = useEngine();
  useFrame(snap.phase !== 'idle');

  useEffect(() => {
    void engine.attachDecks(hostA.current!, hostB.current!);
  }, []);

  const manual = snap.mode === 'manual';
  const processed = snap.audioMode === 'processed';
  const cur = snap.tracks[snap.index];
  const next = snap.plan ? snap.tracks[snap.plan.toIndex] : undefined;
  const songMs = engine.deckTime(snap.active).songMs;

  let status = 'Pick a playlist and press Start.';
  if (manual) status = 'Manual: load a song on each deck, cue, play and use the crossfader.';
  else if (snap.phase === 'loading') status = 'Loading the first track…';
  else if (snap.phase === 'paused') status = 'Paused';
  else if (snap.phase === 'mixing' && next) status = `Mixing into ${next.title}…`;
  else if (snap.phase === 'playing' && snap.plan && next)
    status = `${describe(snap.plan, cur, snap.style.fadeBars)} into ${next.title} in ${fmt(snap.plan.mixOutMs - songMs)}`;
  else if (snap.phase === 'playing') status = 'Last track of the set';
  if (snap.message) status = snap.message;

  const xf = manual ? snap.crossfader : crossfaderFromLevels(engine.deckTime('A').volume, engine.deckTime('B').volume);
  const needsUnlock = snap.audioMode === 'youtube' && device.mobile && (!snap.unlocked.A || !snap.unlocked.B);
  const anyReady = snap.tracks.some((t) => t.status === 'ready');

  return (
    <div className="panel board">
      <div className="board-head">
        <h2>DJ board</h2>
        <div className="mode-switch" role="group" aria-label="Mixing mode">
          <button aria-pressed={!manual} className={!manual ? 'on' : ''} onClick={() => engine.setMode('auto')}>
            Auto
          </button>
          <button aria-pressed={manual} className={manual ? 'on' : ''} onClick={() => engine.setMode('manual')}>
            Manual
          </button>
        </div>
      </div>

      {needsUnlock && (
        <div className="phone-note">
          <b>Playing on this phone (experimental).</b>{' '}
          {device.ios ? 'iPhones can’t fade YouTube volume, so changes will be cuts and drum bridges instead of blends. ' : ''}
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
        </div>
      )}

      <div className={`board-grid ${processed ? '' : 'no-mixer'}`}>
        <DeckUnit id="A" host={hostA} />
        {processed ? (
          <div className="mixer">
            <Strip id="A" />
            <Strip id="B" />
          </div>
        ) : (
          <div className="mixer-note small muted">
            {snap.audioMode === 'youtube' ? (
              <>
                EQ, filter, echo and instrument controls need the song audio, which YouTube players don’t share. Install{' '}
                <code>yt-dlp</code> on the computer running the server (see the README) and restart it. Song switching, volume and
                the crossfader still work.
              </>
            ) : (
              'Starting the decks…'
            )}
          </div>
        )}
        <DeckUnit id="B" host={hostB} />
      </div>

      <div className="board-foot">
        {!manual && (
          <>
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
          </>
        )}
        <label className="xfader" title={manual ? 'Crossfader' : 'The auto-mix moves the crossfader. Switch to Manual to use it.'}>
          <span>A</span>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={xf}
            disabled={!manual}
            aria-label="Crossfader"
            onChange={(e) => engine.setCrossfader(Number(e.target.value))}
            onDoubleClick={() => manual && engine.setCrossfader(0)}
          />
          <span>B</span>
        </label>
        <div className="master">
          <Knob label="MASTER" value={snap.masterVolume} min={0} max={1} def={0.9} format={pct} onChange={(v) => engine.setMasterVolume(v)} />
          {processed && <Vu level={masterLevel()} label="Master level" />}
        </div>
        <span className="status">{status}</span>
      </div>
    </div>
  );
}
