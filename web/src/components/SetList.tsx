import { useState } from 'react';
import { engine } from '../djEngine.ts';
import { useEngine, fmt } from '../hooks.ts';
import { camelotLabel } from '../music.ts';
import { unlockAudio } from '../sfx.ts';
import { parseVideoId } from '../trackPrefs.ts';
import type { DJTrack } from '../types.ts';

function Status({ t }: { t: DJTrack }) {
  if (t.status === 'pending' || t.status === 'loading') return <span className="pill dim">matching…</span>;
  return (
    <>
      {t.status === 'ready' ? (
        <span className="pill ok" title={t.customVideoId ?? t.candidates[t.videoIdx]?.title}>
          ▶ video
        </span>
      ) : (
        <span className="pill bad" title={t.errors.join('\n')}>
          no video
        </span>
      )}
      {t.lyrics ? (
        <span className="pill ok">synced lyrics</span>
      ) : t.plainLyrics ? (
        <span className="pill dim">lyrics</span>
      ) : t.instrumental ? (
        <span className="pill dim">instrumental</span>
      ) : (
        <span className="pill dim">no lyrics</span>
      )}
    </>
  );
}

export function SetList({ enriching }: { enriching: boolean }) {
  const snap = useEngine();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  // Inline link editor (window.prompt isn't available in every browser, e.g. VS Code's).
  const [editing, setEditing] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const live = snap.phase !== 'idle';
  const ready = snap.tracks.filter((t) => t.status === 'ready').length;

  const openEditor = (t: DJTrack) => {
    setEditing(editing === t.id ? null : t.id);
    setLink('');
    setLinkError(null);
  };

  const saveLink = (t: DJTrack) => {
    const id = parseVideoId(link);
    if (!id) return setLinkError("That doesn't look like a YouTube link.");
    engine.changeVideo(t.id, { customVideoId: id });
    setEditing(null);
  };

  return (
    <div className="panel setlist">
      <div className="setlist-head">
        <h2>Set list</h2>
        <span className="muted small">
          {ready}/{snap.tracks.length} ready{enriching && ' · matching on YouTube…'}
        </span>
      </div>
      <div className="row">
        <button onClick={() => engine.autoOrder()} title="Order by harmonic key, tempo and the energy curve">
          ✨ Auto-order
        </button>
        {!live ? (
          <button
            className="primary"
            disabled={ready === 0}
            onClick={() => {
              unlockAudio();
              void engine.start(0);
            }}
          >
            ▶ Start the mix
          </button>
        ) : (
          <button onClick={() => engine.stopAll()}>■ Stop</button>
        )}
      </div>
      <ol className="tracks">
        {snap.tracks.map((t, i) => {
          const isNow = i === snap.index && live;
          const isNext = snap.plan?.toIndex === i;
          return (
            <li
              key={t.id}
              className={`track ${isNow ? 'now' : ''} ${isNext ? 'next' : ''} ${i < snap.index && live ? 'played' : ''}`}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom != null && dragFrom !== i) engine.moveTrack(dragFrom, i);
                setDragFrom(null);
              }}
            >
              <span className="num">{isNow ? '♪' : i + 1}</span>
              {t.image ? <img src={t.image} alt="" /> : <div className="ph sm">♫</div>}
              <div className="meta">
                <div className="title">{t.title}</div>
                <div className="muted small">
                  {t.artists.join(', ')} · {fmt(t.durationMs)}
                </div>
                <div className="pills">
                  <Status t={t} />
                </div>
              </div>
              <div className="bpmkey">
                <span>{t.bpm ? Math.round(t.bpm) : '—'}</span>
                <span className="muted small">BPM</span>
                <span className="key">{camelotLabel(t.camelot)}</span>
              </div>
              <div className="actions">
                <button
                  className="icon"
                  title={live ? 'Mix to this track now' : 'Start the mix here'}
                  disabled={t.status !== 'ready'}
                  onClick={() => {
                    unlockAudio();
                    engine.jumpTo(i);
                  }}
                >
                  ▶
                </button>
                <button
                  className="icon"
                  title="Try the next YouTube result"
                  disabled={t.candidates.length < 2}
                  onClick={() => engine.changeVideo(t.id, { next: true })}
                >
                  ⟳
                </button>
                <button className="icon" title="Paste a YouTube link" onClick={() => openEditor(t)}>
                  🔗
                </button>
              </div>
              {editing === t.id && (
                <div className="link-editor">
                  <input
                    autoFocus
                    placeholder="Paste a YouTube link, e.g. https://www.youtube.com/watch?v=…"
                    value={link}
                    onChange={(e) => (setLink(e.target.value), setLinkError(null))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveLink(t);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                  />
                  <button className="primary" onClick={() => saveLink(t)}>
                    Use video
                  </button>
                  <button className="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                  {t.customVideoId && (
                    <button
                      className="ghost"
                      title="Go back to the automatic YouTube match"
                      onClick={() => (engine.changeVideo(t.id, { reset: true }), setEditing(null))}
                    >
                      Reset
                    </button>
                  )}
                  {linkError && <span className="error small">{linkError}</span>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
