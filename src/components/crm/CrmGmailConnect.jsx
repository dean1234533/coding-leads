import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../../firebase';

/**
 * Reads gmailConnectionStatus/default in real time. Also exported as a hook
 * so other CRM components can gate Gmail-dependent UI on connection state.
 */
export function useGmailConnection() {
  const [status, setStatus] = useState(undefined); // undefined = loading

  useEffect(() => {
    return onSnapshot(
      doc(db, 'gmailConnectionStatus', 'default'),
      (snap) => setStatus(snap.exists() ? snap.data() : { connected: false }),
      () => setStatus({ connected: false })
    );
  }, []);

  return status;
}

export default function CrmGmailConnect({ compact = false }) {
  const status = useGmailConnection();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState(null);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'getGmailAuthUrl');
      const { data } = await fn();
      window.location.href = data.url;
    } catch (err) {
      setError(err?.message ?? 'Could not start Gmail connection.');
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect Gmail? Inbox, sending, and reply detection will stop working until you reconnect.')) return;
    setDisconnecting(true);
    setError(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'disconnectGmail');
      await fn();
    } catch (err) {
      setError(err?.message ?? 'Could not disconnect Gmail.');
    } finally {
      setDisconnecting(false);
    }
  }

  if (status === undefined) {
    return <div className="h-8 w-40 animate-pulse rounded-full bg-gray-800" />;
  }

  if (status.connected) {
    return (
      <div className={`flex items-center gap-2 ${compact ? '' : 'flex-wrap'}`}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Gmail connected{status.emailAddress ? ` · ${status.emailAddress}` : ''}
        </span>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="text-xs font-semibold text-gray-500 hover:text-red-400 transition disabled:opacity-50"
        >
          {disconnecting ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:opacity-50"
      >
        {connecting ? 'Redirecting…' : 'Connect Gmail'}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
