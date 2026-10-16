import { useEffect, useState } from 'react';
import { completeLogin, hasClientId, isLoggedIn, logout } from './auth.ts';
import { getMe, getPlaylistTracks, type Playlist } from './spotifyApi.ts';
import { engine } from './djEngine.ts';
import { enrichAll, toDJTrack } from './enrich.ts';
import { Login } from './components/Login.tsx';
import { PlaylistPicker } from './components/PlaylistPicker.tsx';
import { SetList } from './components/SetList.tsx';
import { Decks } from './components/Decks.tsx';
import { LyricsPane } from './components/LyricsPane.tsx';
import { Settings } from './components/Settings.tsx';
import { PhoneConnect } from './components/PhoneConnect.tsx';
import { PasswordGate } from './components/PasswordGate.tsx';
import { checkPassword, getAppPassword, PasswordError, passwordRequired } from './api.ts';

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<Pick<Playlist, 'id' | 'name'> | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [needPassword, setNeedPassword] = useState(false);

  useEffect(() => {
    completeLogin()
      .catch((e: Error) => setError(e.message))
      .finally(() => setAuthed(isLoggedIn()));
    void (async () => {
      if ((await passwordRequired()) && !(await checkPassword(getAppPassword()))) setNeedPassword(true);
    })();
  }, []);

  useEffect(() => {
    if (authed) getMe().then((me) => setUser(me.display_name ?? me.id), (e: Error) => setError(e.message));
  }, [authed]);

  async function pick(p: Pick<Playlist, 'id' | 'name'>) {
    setError(null);
    engine.stopAll();
    setPlaylist(p);
    try {
      const tracks = (await getPlaylistTracks(p.id)).map(toDJTrack);
      engine.setTracks(tracks);
      setEnriching(true);
      await enrichAll(tracks, (id, patch) => engine.updateTrack(id, patch));
    } catch (e) {
      if (e instanceof PasswordError) setNeedPassword(true);
      else setError((e as Error).message);
    } finally {
      setEnriching(false);
    }
  }

  if (authed === null) return null;
  if (needPassword)
    return (
      <PasswordGate
        onOk={() => {
          setNeedPassword(false);
          // Resume matching for anything that was waiting on the password.
          if (engine.tracks.length) void enrichAll(engine.tracks, (id, patch) => engine.updateTrack(id, patch));
        }}
      />
    );
  if (!hasClientId || !authed) return <Login error={error} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🎧</span> Auto-DJ
          {playlist && <span className="crumb">/ {playlist.name}</span>}
        </div>
        <div className="topbar-right">
          <PhoneConnect />
          {playlist && (
            <button className="ghost" onClick={() => (engine.stopAll(), engine.setTracks([]), setPlaylist(null))}>
              Change playlist
            </button>
          )}
          <span className="muted">{user}</span>
          <button className="ghost" onClick={() => (logout(), location.reload())}>
            Log out
          </button>
        </div>
      </header>
      {error && (
        <div className="banner" onClick={() => setError(null)}>
          {error}
        </div>
      )}
      <main className="layout">
        <section className="col-left">
          {playlist ? <SetList enriching={enriching} /> : <PlaylistPicker onPick={pick} onError={setError} />}
        </section>
        <section className="col-right">
          <Decks />
          <LyricsPane />
          <Settings />
        </section>
      </main>
      <footer className="footer muted small">
        Tempo &amp; key data by{' '}
        <a href="https://getsongbpm.com" target="_blank" rel="noreferrer">
          GetSongBPM
        </a>{' '}
        · Lyrics by{' '}
        <a href="https://lrclib.net" target="_blank" rel="noreferrer">
          LRCLIB
        </a>
      </footer>
    </div>
  );
}
