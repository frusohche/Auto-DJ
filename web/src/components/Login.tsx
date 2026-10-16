import { hasClientId, login } from '../auth.ts';

export function Login({ error }: { error: string | null }) {
  return (
    <div className="login">
      <div className="login-card">
        <div className="login-logo">🎧</div>
        <h1>Auto-DJ</h1>
        <p className="muted">Turn a Spotify playlist into a live DJ set, with blends, drops and sing-along lyrics.</p>
        {hasClientId ? (
          <button className="primary big" onClick={() => void login()}>
            Log in with Spotify
          </button>
        ) : (
          <div className="setup">
            <p>
              <b>Setup needed:</b> copy <code>.env.example</code> to <code>.env</code>, set{' '}
              <code>VITE_SPOTIFY_CLIENT_ID</code>, then restart <code>npm run dev</code>.
            </p>
            <p className="muted">
              In the Spotify dashboard, add the redirect URI <code>{location.origin}/callback</code>.
            </p>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
