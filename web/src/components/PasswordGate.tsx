import { useState } from 'react';
import { checkPassword, setAppPassword } from '../api.ts';

/** Shown when the server has APP_PASSWORD set and this browser doesn't know it yet. */
export function PasswordGate({ onOk }: { onOk: () => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (await checkPassword(pw)) {
      setAppPassword(pw);
      onOk();
    } else setError('That password is not right.');
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-logo">🔒</div>
        <h1>Auto-DJ</h1>
        <p className="muted">Enter the app password (the APP_PASSWORD you set on the server).</p>
        <div className="row">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} />
          <button className="primary" onClick={() => void submit()}>
            Unlock
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
