import { useEffect, useRef, useState } from 'react';
import { fmt, useFrame } from '../hooks.ts';
import { LyricsView } from '../components/LyricsView.tsx';
import { TapTempo } from '../components/TapTempo.tsx';
import type { RemoteCommand, RemoteState } from './protocol.ts';

type Tab = 'lyrics' | 'set' | 'style';

function codeFromUrl(): string {
  const m = /^\/r\/([A-Za-z0-9]{4,8})/.exec(location.pathname);
  return (m?.[1] ?? new URLSearchParams(location.search).get('code') ?? '').toUpperCase();
}

/** The phone remote: controls, set list and sing-along lyrics for a set playing on another device. */
export function RemoteApp() {
  const [code, setCode] = useState(codeFromUrl);
  const [input, setInput] = useState('');
  const [state, setState] = useState<RemoteState | null>(null);
  const [link, setLink] = useState<'connecting' | 'live' | 'lost' | 'missing'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('lyrics');
  const [sweep, setSweep] = useState(true);
  const receivedAt = useRef(0);
  const pane = useRef<HTMLDivElement>(null);
  const live = state?.phase === 'playing' || state?.phase === 'mixing';
  useFrame(live);

  useEffect(() => {
    if (!code) return;
    history.replaceState(null, '', `/r/${code}`);
    setLink('connecting');
    const src = new EventSource(`/api/rooms/${code}/events?role=remote`);
    src.onopen = () => setLink('live');
    src.onerror = () => setLink(src.readyState === EventSource.CLOSED ? 'missing' : 'lost');
    src.addEventListener('state', (e) => {
      receivedAt.current = performance.now();
      setState(JSON.parse((e as MessageEvent).data));
    });
    return () => src.close();
  }, [code]);

  async function send(c: RemoteCommand) {
    setError(null);
    try {
      const r = await fetch(`/api/rooms/${code}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      });
      if (!r.ok) setError(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `Error ${r.status}`);
    } catch {
      setError('No connection');
    }
  }

  if (!code || link === 'missing') {
    return (
      <div className="remote login">
        <div className="login-card">
          <div className="login-logo">📱</div>
          <h1>Auto-DJ remote</h1>
          {link === 'missing' && <p className="error">Room {code} wasn’t found. Check the code on the computer.</p>}
          <p className="muted">Enter the room code shown on the computer (📱 Phone remote).</p>
          <div className="row">
            <input
              className="code-input"
              placeholder="ABC123"
              value={input}
              maxLength={8}
              autoCapitalize="characters"
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && input && setCode(input)}
            />
            <button className="primary" disabled={!input} onClick={() => setCode(input)}>
              Connect
            </button>
          </div>
        </div>
      </div>
    );
  }

  const elapsed = live ? performance.now() - receivedAt.current : 0;
  const songMs = (state?.focusSongMs ?? 0) + elapsed;
  const focus = state ? state.tracks[state.focusIndex] : undefined;
  const now = state ? state.tracks[state.index] : undefined;
  const next = state?.nextIndex != null ? state.tracks[state.nextIndex] : undefined;
  const lyr = focus ? state?.lyrics[focus.id] : undefined;
  const upcoming = state?.upcoming != null ? state.tracks[state.upcoming] : undefined;
  const upLyr = upcoming ? state?.lyrics[upcoming.id]?.lines?.find((l) => l.text) : undefined;

  let status = 'Waiting for the computer…';
  if (state) {
    if (state.phase === 'idle') status = 'Ready. Press Start.';
    else if (state.phase === 'loading') status = 'Loading…';
    else if (state.phase === 'paused') status = 'Paused';
    else if (state.phase === 'mixing' && next) status = `Mixing into ${next.title}…`;
    else if (state.planLabel && next && state.mixInMs != null)
      status = `${state.planLabel} into ${next.title} in ${fmt(state.mixInMs - elapsed)}`;
    else status = 'Last track of the set';
  }

  return (
    <div className="remote">
      <header className="remote-top">
        <span className="brand">🎧 Auto-DJ</span>
        <span className={`dot ${link}`}>{link === 'live' ? `Room ${code}` : 'Reconnecting…'}</span>
      </header>

      <section className="now">
        {focus?.image ? <img src={focus.image} alt="" /> : <div className="ph">♫</div>}
        <div className="now-meta">
          <div className="title">{focus?.title ?? '—'}</div>
          <div className="muted small">{focus?.artists.join(', ')}</div>
          {focus && (
            <div className="bar">
              <div style={{ width: `${Math.min(100, (songMs / focus.durationMs) * 100)}%` }} />
            </div>
          )}
          <div className="small status">{status}</div>
        </div>
      </section>

      <section className="remote-transport">
        {!state || state.phase === 'idle' ? (
          <button className="primary" onClick={() => send({ type: 'start' })}>
            ▶ Start
          </button>
        ) : state.phase === 'paused' ? (
          <button className="primary" onClick={() => send({ type: 'resume' })}>
            ▶ Resume
          </button>
        ) : (
          <button onClick={() => send({ type: 'pause' })}>❚❚ Pause</button>
        )}
        <button disabled={state?.phase !== 'playing'} onClick={() => send({ type: 'mixNow' })}>
          ⇄ Mix now
        </button>
        {state && state.phase !== 'idle' && <button onClick={() => send({ type: 'stop' })}>■</button>}
      </section>
      {state && (
        <label className="remote-vol">
          🔊
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            defaultValue={state.masterVolume}
            onChange={(e) => send({ type: 'volume', value: Number(e.target.value) })}
          />
        </label>
      )}
      {error && <p className="error small center-tight">{error}</p>}

      <nav className="tabs">
        {(['lyrics', 'set', 'style'] as const).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {{ lyrics: '🎤 Lyrics', set: '📃 Set list', style: '🎛️ Style' }[t]}
          </button>
        ))}
      </nav>

      {tab === 'lyrics' && (
        <section className="panel lyrics remote-lyrics" ref={pane}>
          {focus && lyr ? (
            <LyricsView
              lines={lyr.lines}
              plain={lyr.plain}
              instrumental={lyr.instrumental}
              songMs={songMs}
              durationMs={focus.durationMs}
              title={focus.title}
              artist={focus.artists[0] ?? ''}
              sweep={sweep}
            />
          ) : (
            <p className="muted center">Lyrics appear here when the mix is playing 🎤</p>
          )}
          {upcoming && (
            <div className="upnext">
              <span className="muted small">Up next</span> <b>{upcoming.title}</b>
              {upLyr && <span className="muted"> · “{upLyr.text}”</span>}
            </div>
          )}
          {focus && lyr?.lines && (
            <div className="row tight wrap-center">
              <button className="ghost small" onClick={() => send({ type: 'nudge', trackId: focus.id, deltaMs: 500 })}>
                Lyrics too early
              </button>
              <button className="ghost small" onClick={() => send({ type: 'nudge', trackId: focus.id, deltaMs: -500 })}>
                Lyrics too late
              </button>
              <label className="small check">
                <input type="checkbox" checked={sweep} onChange={(e) => setSweep(e.target.checked)} /> sweep
              </label>
              <button
                className="ghost small"
                onClick={() => (document.fullscreenElement ? document.exitFullscreen() : pane.current?.requestFullscreen?.())}
              >
                ⛶ Full screen
              </button>
            </div>
          )}
        </section>
      )}

      {tab === 'set' && state && (
        <section className="panel">
          <div className="row">
            <button onClick={() => send({ type: 'autoOrder' })}>✨ Auto-order</button>
          </div>
          <ol className="tracks remote-tracks">
            {state.tracks.map((t, i) => (
              <li
                key={t.id}
                className={`track ${i === state.index && state.phase !== 'idle' ? 'now' : ''} ${i === state.nextIndex ? 'next' : ''}`}
              >
                <span className="num">{i === state.index && state.phase !== 'idle' ? '♪' : i + 1}</span>
                <div className="meta">
                  <div className="title">{t.title}</div>
                  <div className="muted small">
                    {t.artists[0]} · {t.bpm ? `${Math.round(t.bpm)} BPM` : '— BPM'} · {t.key}
                  </div>
                </div>
                <div className="actions">
                  <button className="icon" disabled={!t.ready} onClick={() => send({ type: 'jumpTo', trackId: t.id })}>
                    ▶
                  </button>
                  <button className="icon" disabled={i === 0} onClick={() => send({ type: 'move', trackId: t.id, delta: -1 })}>
                    ↑
                  </button>
                  <button
                    className="icon"
                    disabled={i === state.tracks.length - 1}
                    onClick={() => send({ type: 'move', trackId: t.id, delta: 1 })}
                  >
                    ↓
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {tab === 'style' && state && (
        <section className="panel remote-style">
          <label>
            Mix style
            <select value={state.styleId} onChange={(e) => send({ type: 'style', id: e.target.value })}>
              {state.styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {!state.styles.some((s) => s.id === state.styleId) && <option value={state.styleId}>Custom</option>}
            </select>
          </label>
          {now && state.phase !== 'idle' && (
            <div>
              <p className="small muted">Tap along to “{now.title}” to set its tempo (used by drum bridges):</p>
              <TapTempo current={now.bpm} onBpm={(bpm) => send({ type: 'bpm', trackId: now.id, bpm })} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
