import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase';
import CrmComposer from './CrmComposer';

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function CrmThreadView({ threadId, onClose }) {
  const [thread, setThread] = useState(null);
  const [error, setError] = useState(null);
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    setThread(null);
    setError(null);
    const fn = httpsCallable(getFunctions(app), 'gmailGetThread');
    fn({ threadId }).then(({ data }) => setThread(data)).catch((err) => setError(err?.message ?? 'Failed to load thread.'));
  }, [threadId]);

  const lastMessage = thread?.messages?.[thread.messages.length - 1];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-3xl rounded-xl border border-gray-800 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <h2 className="truncate text-sm font-semibold text-gray-100">{thread?.messages?.[0]?.subject || 'Conversation'}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-500 transition hover:bg-gray-800 hover:text-gray-300">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4 space-y-4">
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
  );
}
