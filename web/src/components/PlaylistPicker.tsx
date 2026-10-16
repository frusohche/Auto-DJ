import { useEffect, useState } from 'react';
import { getPlaylists, parsePlaylistId, type Playlist } from '../spotifyApi.ts';

interface Props {
  onPick: (p: Pick<Playlist, 'id' | 'name'>) => void;
  onError: (msg: string) => void;
}

export function PlaylistPicker({ onPick, onError }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [url, setUrl] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    getPlaylists().then(setPlaylists, (e: Error) => {
      setPlaylists([]);
      onError(e.message);
    });
  }, [onError]);

  const byUrl = () => {
    const id = parsePlaylistId(url);
    if (id) onPick({ id, name: 'Playlist' });
    else onError("That doesn't look like a Spotify playlist link.");
  };

  const shown = (playlists ?? []).filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="panel picker">
      <h2>Pick a playlist</h2>
      <div className="row">
        <input placeholder="Search your playlists" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="row">
        <input
          placeholder="…or paste a playlist link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && byUrl()}
        />
        <button onClick={byUrl}>Load</button>
      </div>
      {playlists === null && <p className="muted">Loading playlists…</p>}
      <div className="playlist-grid">
        {shown.map((p) => (
          <button key={p.id} className="playlist-card" onClick={() => onPick(p)}>
            {p.image ? <img src={p.image} alt="" /> : <div className="ph">♫</div>}
            <span className="pl-name">{p.name}</span>
            <span className="muted small">
              {p.trackCount} tracks · {p.owner}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
