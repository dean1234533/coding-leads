import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { app, db } from '../../firebase';
import CrmComposer from './CrmComposer';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function parseAddress(raw) {
  if (!raw) return null;
  const match = raw.match(/^"?([^"<]*)"?\s*<(.+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
  return { name: '', email: raw.trim().toLowerCase() };
}

// Finds the other party in the conversation so "Add to CRM" knows who to add.
// Prefers the first inbound message (a reply from them); if the thread is
// entirely outbound (you've sent but haven't heard back yet), falls back to
// the "To" address of your own sent message instead.
function extractCorrespondent(messages) {
  for (const m of messages ?? []) {
    const from = m.from ?? '';
    if (from && !from.toLowerCase().includes('dean-da-dev.co.uk')) {
      return parseAddress(from);
    }
  }
  for (const m of messages ?? []) {
    if (m.to) return parseAddress(m.to);
  }
  return null;
}

export default function CrmThreadView({ threadId, onClose }) {
  const [thread, setThread] = useState(null);
  const [error, setError] = useState(null);
  const [replying, setReplying] = useState(false);
  const [crmStatus, setCrmStatus] = useState(null); // null | 'adding' | 'added' | 'linked' | 'error'

  useEffect(() => {
    setThread(null);
    setError(null);
    setCrmStatus(null);
    const fn = httpsCallable(getFunctions(app), 'gmailGetThread');
    fn({ threadId }).then(({ data }) => setThread(data)).catch((err) => setError(err?.message ?? 'Failed to load thread.'));
  }, [threadId]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lastMessage = thread?.messages?.[thread.messages.length - 1];
  const correspondent = extractCorrespondent(thread?.messages);
  const hasInboundMessage = thread?.messages?.some((m) => (m.from ?? '').toLowerCase() === correspondent?.email);

  async function handleAddToCrm() {
    if (!correspondent?.email) return;
    setCrmStatus('adding');
    try {
      const dupeQuery = query(collection(db, 'crmLeads'), where('email', '==', correspondent.email));
      const dupeSnap = await getDocs(dupeQuery);
      if (!dupeSnap.empty) {
        const existing = dupeSnap.docs[0];
        if (existing.data().gmailThreadId !== threadId) {
          await updateDoc(doc(db, 'crmLeads', existing.id), { gmailThreadId: threadId, updatedAt: serverTimestamp() });
        }
        setCrmStatus('linked');
        return;
      }
      await addDoc(collection(db, 'crmLeads'), {
        businessName: correspondent.name || correspondent.email,
        contactName: correspondent.name || null,
        email: correspondent.email,
        gmailThreadId: threadId,
        status: hasInboundMessage ? 'Replied' : 'Email Sent',
        priority: 'Medium',
        source: 'Gmail Inbox',
        tags: [],
        dateAdded: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCrmStatus('added');
    } catch (err) {
      console.error('[CrmThreadView] Add to CRM failed:', err);
      setCrmStatus('error');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-gray-800 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-800 px-5 py-4">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-100">{thread?.messages?.[0]?.subject || 'Conversation'}</h2>
          {correspondent?.email && (
            <button
              onClick={handleAddToCrm}
              disabled={crmStatus === 'adding' || crmStatus === 'added' || crmStatus === 'linked'}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-default ${
                crmStatus === 'added' || crmStatus === 'linked'
                  ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                  : 'bg-teal-600 text-white hover:bg-teal-500'
              }`}
            >
              {crmStatus === 'adding' ? 'Adding…' : crmStatus === 'added' ? 'Added to CRM' : crmStatus === 'linked' ? 'Linked to Lead' : crmStatus === 'error' ? 'Failed — retry' : 'Add to CRM'}
            </button>
          )}
          <button onClick={onClose} className="shrink-0 rounded-lg p-1 text-gray-500 transition hover:bg-gray-800 hover:text-gray-300">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-4 px-5 py-4">
            {error && <p className="text-sm text-red-400">{error}</p>}
            {!thread && !error && <p className="text-sm text-gray-600">Loading conversation…</p>}
            {thread?.messages.map((m) => (
              <div key={m.id} className="rounded-lg border border-gray-800 bg-gray-950/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                  <span className="truncate text-gray-300">{m.from}</span>
                  <span>{formatDate(m.date)}</span>
                </div>
                {m.bodyHtml ? (
                  <div className="mt-2 text-sm text-gray-200" dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
                ) : (
                  <p className="mt-2 whitespace-pre-line text-sm text-gray-200">{m.bodyText}</p>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-gray-800 px-5 py-4">
            {replying ? (
              <CrmComposer
                defaultTo={lastMessage?.from?.match(/<(.+)>/)?.[1] ?? lastMessage?.from ?? ''}
                defaultSubject={lastMessage?.subject?.startsWith('Re:') ? lastMessage.subject : `Re: ${lastMessage?.subject ?? ''}`}
                threadId={threadId}
                inReplyTo={lastMessage?.messageIdHeader}
                references={lastMessage?.messageIdHeader}
                onSent={() => setReplying(false)}
              />
            ) : (
              <button onClick={() => setReplying(true)}
                className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400">
                Reply
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
