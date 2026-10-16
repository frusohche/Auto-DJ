import { useEffect, useState, useSyncExternalStore } from 'react';
import QRCode from 'qrcode';
import { remoteLink } from '../remote/remoteLink.ts';

/** Header button + panel that pairs a phone as a remote (QR code / short code). */
export function PhoneConnect() {
  const [open, setOpen] = useState(false);
  const status = useSyncExternalStore(remoteLink.subscribe, remoteLink.getStatus);
  const [qr, setQr] = useState<string | null>(null);
  const local = /^(127\.|localhost$)/.test(location.hostname);
  // On 127.0.0.1 a phone can't reach "this computer", so point it at the computer's Wi-Fi address instead.
  const [lanIps, setLanIps] = useState<string[]>([]);
  const [lanIp, setLanIp] = useState<string | null>(null);
  const origin = local ? (lanIp ? `${location.protocol}//${lanIp}:${location.port}` : null) : location.origin;
  const url = status.code && origin ? `${origin}/r/${status.code}` : null;

  useEffect(() => {
    if (open) void remoteLink.connect();
    if (open && local && lanIps.length === 0) {
      fetch('/api/lan')
        .then((r) => r.json())
        .then((d: { ips: string[] }) => {
          setLanIps(d.ips);
          setLanIp(d.ips[0] ?? null);
        })
        .catch(() => {});
    }
  }, [open, local, lanIps.length]);

  useEffect(() => {
    if (!url) return setQr(null);
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#0d0b12', light: '#ffffff' } }).then(setQr, () => setQr(null));
  }, [url]);

  return (
    <>
      <button className="ghost" onClick={() => setOpen(!open)}>
        📱 Phone remote{status.remotes > 0 ? ` · ${status.remotes} connected` : ''}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal panel" onClick={(e) => e.stopPropagation()}>
            <h2>Control the mix from your phone</h2>
            <p className="muted small">
              The music keeps playing from this computer. Your phone gets the controls, the set list and the sing-along lyrics.
            </p>
            {status.error && <p className="error">{status.error}</p>}
            {url ? (
              <div className="pair">
                {qr && <img src={qr} alt="QR code for the phone remote" width={220} height={220} />}
                <div>
                  <p>Scan the code with your phone camera, or open:</p>
                  <p className="pair-url">{url}</p>
                  <p>
                    Room code: <b className="code">{status.code}</b>
                  </p>
                  <p className="small">
                    {status.connected ? '🟢 Linked' : '🟡 Connecting…'} · {status.remotes} phone{status.remotes === 1 ? '' : 's'}{' '}
                    connected
                  </p>
                  <button className="ghost small" onClick={() => (remoteLink.disconnect(), void remoteLink.connect(true))}>
                    New code
                  </button>
                </div>
              </div>
            ) : (
              !status.error && <p className="muted">Creating a room…</p>
            )}
            {local && (
              <div className="small warn">
                {lanIps.length === 0 ? (
                  <p>Couldn’t find this computer’s Wi-Fi address. Use the online version instead (README → “Put it online”).</p>
                ) : (
                  <>
                    <p>
                      Your phone must be on the <b>same Wi-Fi</b> as this computer. If Windows asks whether Node.js may use the network,
                      allow it on <b>private networks</b>.
                    </p>
                    {lanIps.length > 1 && (
                      <p>
                        Not connecting? Try another address:{' '}
                        <select value={lanIp ?? ''} onChange={(e) => setLanIp(e.target.value)}>
                          {lanIps.map((ip) => (
                            <option key={ip}>{ip}</option>
                          ))}
                        </select>
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            <button onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}
