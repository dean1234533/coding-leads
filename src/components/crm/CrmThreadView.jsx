import { useState, useEffect, useMemo } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { app, db } from '../../firebase';
import CrmComposer from './CrmComposer';

const SELF_DOMAIN = 'dean-da-dev.co.uk';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function parseAddress(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^"?([^"<]*)"?\s*<(.+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
  if (!trimmed.includes('@')) return null;
  return { name: '', email: trimmed.toLowerCase() };
}

// Splits a header value into individual addresses — handles "A <a@x.com>, B <b@x.com>"
// without breaking on commas that appear inside a display name's <...> part.
function parseAddressList(raw) {
  if (!raw) return [];
  return raw
    .split(/,(?=(?:[^<]*<[^<]*>)*[^<]*$)/)
    .map(parseAddress)
    .filter(Boolean);
}

// Every unique external address anywhere in the thread (From/To/Cc across all
// messages), excluding your own outreach address — this is the full set of
// people this conversation actually involves, not just one guessed contact.
function extractAllCorrespondents(messages) {
  const byEmail = new Map();
  for (const m of messages ?? []) {
    for (const raw of [m.from, m.to, m.cc]) {
      for (const addr of parseAddressList(raw)) {
        if (addr.email.includes(SELF_DOMAIN)) continue;
        if (!byEmail.has(addr.email) || addr.name) byEmail.set(addr.email, addr);
      }
    }
  }
  return [...byEmail.values()];
}

export default function CrmThreadView({ threadId, onClose }) {
  const [thread, setThread] = useState(null);
  const [error, setError] = useState(null);
  const [replying, setReplying] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState(null); // { added, linked, skipped } | null

  useEffect(() => {
    setThread(null);
    setError(null);
    setAddResult(null);
    const fn = httpsCallable(getFunctions(app), 'gmailGetThread');
    fn({ threadId }).then(({ data }) => setThread(data)).catch((err) => setError(err?.message ?? 'Failed to load thread.'));
  }, [threadId]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lastMessage = thread?.messages?.[thread.messages.length - 1];
  const correspondents = useMemo(() => extractAllCorrespondents(thread?.messages), [thread]);

  async function handleAddToCrm() {
    if (correspondents.length === 0) return;
    setAdding(true);
    setAddResult(null);
    let added = 0;
    let linked = 0;
    let skipped = 0;

    for (const person of correspondents) {
      try {
        const dupeQuery = query(collection(db, 'crmLeads'), where('email', '==', person.email));
        const dupeSnap = await getDocs(dupeQuery);
        if (!dupeSnap.empty) {
          const existing = dupeSnap.docs[0];
          if (existing.data().gmailThreadId !== threadId) {
            await updateDoc(doc(db, 'crmLeads', existing.id), { gmailThreadId: threadId, updatedAt: serverTimestamp() });
            linked += 1;
          } else {
            skipped += 1;
          }
          continue;
        }
        const isInbound = thread.messages.some((m) => (m.from ?? '').toLowerCase().includes(person.email));
        await addDoc(collection(db, 'crmLeads'), {
          businessName: person.name || person.email,
          contactName: person.name || null,
          email: person.email,
          gmailThreadId: threadId,
          status: isInbound ? 'Replied' : 'Email Sent',
          priority: 'Medium',
          source: 'Gmail Inbox',
          tags: [],
          dateAdded: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        added += 1;
      } catch (err) {
        console.error(`[CrmThreadView] Add to CRM failed for ${person.email}:`, err);
        skipped += 1;
      }
    }

    setAdding(false);
    setAddResult({ added, linked, skipped });
  }

  const buttonLabel = adding
    ? 'Adding…'
    : addResult
      ? `Added ${addResult.added}${addResult.linked ? `, linked ${addResult.linked}` : ''}${addResult.skipped ? `, skipped ${addResult.skipped}` : ''}`
      : correspondents.length > 1
        ? `Add ${correspondents.length} as Leads`
        : 'Add to CRM';

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
          {correspondents.length > 0 && (
            <button
              onClick={handleAddToCrm}
              disabled={adding || !!addResult}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-default ${
                addResult ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30' : 'bg-teal-600 text-white hover:bg-teal-500'
              }`}
            >
              {buttonLabel}
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
