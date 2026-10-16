import { useEffect, useState, useSyncExternalStore } from 'react';
import QRCode from 'qrcode';
import { remoteLink } from '../remote/remoteLink.ts';

/** Header button + panel that pairs a phone as a remote (QR code / short code). */
export function PhoneConnect() {
  const [open, setOpen] = useState(false);
  const status = useSyncExternalStore(remoteLink.subscribe, remoteLink.getStatus);
  const [qr, setQr] = useState<string | null>(null);
  const url = status.code ? `${location.origin}/r/${status.code}` : null;

  useEffect(() => {
    if (open) void remoteLink.connect();
  }, [open]);

  useEffect(() => {
    if (!url) return setQr(null);
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#0d0b12', light: '#ffffff' } }).then(setQr, () => setQr(null));
  }, [url]);

  const local = /^(127\.|localhost)/.test(location.hostname);

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
              <p className="small warn">
                This address only works on this computer. To use your phone, open the app from its online address (see README → "Put it
                online").
              </p>
            )}
            <button onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </>
  );
}
