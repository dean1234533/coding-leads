import { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase';
import CrmThreadView from './CrmThreadView';
import CrmComposer from './CrmComposer';
import Modal from '../Modal';

const FOLDERS = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'sent', label: 'Sent' },
  { key: 'search', label: 'Search' },
];

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CrmGmailInbox({ connected }) {
  const [folder, setFolder] = useState('inbox');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openThreadId, setOpenThreadId] = useState(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'gmailListMessages');
      const { data } = await fn({ folder, query: folder === 'search' ? query : '' });
      setItems(data.items);
    } catch (err) {
      setError(err?.message ?? 'Failed to load messages.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [connected, folder, query]);

  useEffect(() => { load(); }, [connected, folder]);

  if (!connected) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center text-sm text-gray-500">
        Connect Gmail from Settings to view your inbox.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-gray-800 bg-gray-900 p-1 w-fit">
          {FOLDERS.map(({ key, label }) => (
            <button key={key} onClick={() => setFolder(key)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                folder === key ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setComposing(true)}
          className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400">
          + Compose
        </button>
      </div>

      {folder === 'search' && (
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Gmail (e.g. from:client subject:quote)"
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
          <button type="submit" className="rounded-lg bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-700">Search</button>
        </form>
      )}

      <section className="rounded-xl border border-gray-800 bg-gray-900">
        {loading && <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-800/40" />)}</div>}
        {error && <p className="p-4 text-sm text-red-400">{error}</p>}
        {!loading && items?.length === 0 && <p className="p-8 text-center text-sm text-gray-600">No messages found.</p>}
        <div className="divide-y divide-gray-800/50">
          {!loading && items?.map((m) => (
            <button key={m.id} onClick={() => setOpenThreadId(m.threadId)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-gray-800/30">
              <span className={`h-2 w-2 shrink-0 rounded-full ${m.unread ? 'bg-blue-400' : 'bg-transparent'}`} />
              <span className="w-20 shrink-0 truncate text-sm text-gray-300 sm:w-40">{m.from?.replace(/<.*>/, '').trim() || m.from}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-200">
                {m.subject || '(no subject)'} <span className="text-gray-600">— {m.snippet}</span>
              </span>
              <span className="shrink-0 text-xs text-gray-600">{formatDate(m.date)}</span>
            </button>
          ))}
        </div>
      </section>

      {openThreadId && <CrmThreadView threadId={openThreadId} onClose={() => setOpenThreadId(null)} />}

      {composing && (
        <Modal title="New Email" onClose={() => setComposing(false)} maxWidth="max-w-2xl">
          <CrmComposer onSent={() => setComposing(false)} onSaved={() => setComposing(false)} />
        </Modal>
      )}
    </div>
  );
}
