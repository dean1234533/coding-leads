import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../../firebase';
import { followUpPatchForSend } from '../../utils/crmFollowUps';

const CODING_LEAD_CONTACTED_FROM = new Set(['New', 'Saved']);
const CHANNELS = ['email', 'whatsapp', 'sms', 'instagram', 'facebook'];

const STATUS_FILTERS = ['pending', 'approved', 'sent', 'rejected', 'all'];

const STATUS_COLORS = {
  pending: 'text-amber-400 bg-amber-500/10 ring-amber-500/30',
  approved: 'text-blue-400 bg-blue-500/10 ring-blue-500/30',
  sent: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/30',
  rejected: 'text-red-400 bg-red-500/10 ring-red-500/30',
};

// Same UK-only digits-only formatting CrmLeadDetail.jsx uses for its
// wa.me/sms: links — duplicated rather than imported since that copy lives
// inside a component file, not a shared util.
function formatPhoneIntl(phone) {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('44')) return digits;
  if (digits.startsWith('0')) return `44${digits.slice(1)}`;
  return digits;
}

function ApprovalCard({ item, onChanged }) {
  const [body, setBody] = useState(item.body);
  const [subject, setSubject] = useState(item.subject ?? '');
  const [channel, setChannel] = useState(item.channel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lead, setLead] = useState(null);

  // Prefetched on mount (not inside the click handler) — window.open and
  // navigator.clipboard.writeText only work when called synchronously, as
  // the direct, immediate result of a user click. Any `await` in between
  // (a Firestore lookup, a callable function) breaks that "real user
  // gesture" chain in most browsers (Safari especially), which is exactly
  // why WhatsApp/Facebook silently never opened and Instagram's clipboard
  // write came back "permission denied" — both were being called several
  // awaits deep into the click handler. Having the lead's contact info
  // already in state means the open/copy can happen as the very first,
  // fully synchronous thing the click does.
  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, item.leadCollection, item.leadId)).then((snap) => {
      if (!cancelled) setLead(snap.exists() ? snap.data() : {});
    });
    return () => { cancelled = true; };
  }, [item.leadCollection, item.leadId]);

  const dirty = body !== item.body || subject !== (item.subject ?? '');

  async function handleReject() {
    setBusy(true);
    setError(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'rejectApproval');
      await fn({ approvalId: item.id });
      onChanged?.();
    } catch (err) {
      setError(err?.message ?? 'Failed to reject.');
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveAndSend() {
    setError(null);
    if (!lead) { setError('Still loading this lead\'s contact details — try again in a moment.'); return; }

    // Everything that needs a live user gesture happens FIRST, before any
    // await, for every non-email channel — validation errors (no number
    // found) surface immediately, and window.open/clipboard calls fire
    // synchronously inside the click rather than after network round-trips.
    if (channel === 'whatsapp') {
      const number = lead.whatsappUrl?.match(/wa\.me\/(\d+)/)?.[1] ?? formatPhoneIntl(lead.phone);
      if (!number) { setError('No WhatsApp number found for this lead.'); return; }
      const win = window.open(`https://wa.me/${number}?text=${encodeURIComponent(body)}`, '_blank', 'noopener,noreferrer');
      // window.open returns null (not a throw) when a popup blocker steps
      // in — without this check, the approval still got marked "sent" even
      // though nothing actually opened, which is exactly why it looked like
      // the message "just disappeared".
      if (!win) { setError('Your browser blocked the WhatsApp popup — allow popups for this site and try again.'); return; }
    } else if (channel === 'sms') {
      const number = formatPhoneIntl(lead.phone);
      if (!number) { setError('No phone number found for this lead.'); return; }
      window.location.href = `sms:${number}&body=${encodeURIComponent(body)}`;
    } else if (channel === 'instagram') {
      // Instagram has no send API or pre-filled-DM deep link (unlike
      // wa.me/sms:) — same reasoning as CrmInstagramOutreach's "Copy
      // caption" flow. Approving just copies the text so Dean can paste
      // it into the DM himself.
      try {
        await navigator.clipboard.writeText(body);
      } catch {
        setError('Could not copy automatically — select and copy the message text manually below.');
        return;
      }
    } else if (channel === 'facebook') {
      // m.me/PAGE-NAME?text=... does support a pre-filled Messenger
      // message (confirmed against Meta's own m.me docs), unlike
      // Instagram — same wa.me-style deep link, just needs the page's
      // username/id pulled out of whatever facebookUrl actually is.
      const page = lead.facebookUrl?.match(/facebook\.com\/(?:pages\/)?([^/?]+)/)?.[1];
      if (!page) { setError('No Facebook page found for this lead.'); return; }
      const win = window.open(`https://m.me/${page}?text=${encodeURIComponent(body)}`, '_blank', 'noopener,noreferrer');
      if (!win) { setError('Your browser blocked the Messenger popup — allow popups for this site and try again.'); return; }
    }

    setBusy(true);
    try {
      const approve = httpsCallable(getFunctions(app), 'approveApproval');
      await approve({ approvalId: item.id, body, subject, channel });

      if (channel === 'email') {
        const email = lead.email;
        if (!email) throw new Error('This lead has no email address on file — add one first.');
        const send = httpsCallable(getFunctions(app), 'gmailSendEmail');
        await send({ to: email, subject: subject || '(no subject)', bodyText: body });
      }

      const markSent = httpsCallable(getFunctions(app), 'markApprovalSent');
      await markSent({ approvalId: item.id });

      // Sending from here used to leave the lead's follow-up ladder
      // untouched — same gap CrmComposer.jsx already closed for its own
      // send path (see followUpPatchForSend), just never applied here too.
      if (item.leadCollection === 'crmLeads') {
        await updateDoc(doc(db, 'crmLeads', item.leadId), { ...followUpPatchForSend(lead, new Date()), updatedAt: serverTimestamp() }).catch(() => {});
      } else if (item.leadCollection === 'codingLeads' && CODING_LEAD_CONTACTED_FROM.has(lead.status)) {
        await updateDoc(doc(db, 'codingLeads', item.leadId), { status: 'Contacted', updatedAt: serverTimestamp() }).catch(() => {});
      }

      onChanged?.();
    } catch (err) {
      setError(err?.message ?? 'Failed to send.');
    } finally {
      setBusy(false);
    }
  }

  const isActionable = item.status === 'pending' || item.status === 'approved';

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-100">{item.leadName || 'Unknown lead'}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-500">
            {isActionable ? (
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                disabled={busy}
                className="rounded border border-gray-700 bg-gray-800/50 px-1.5 py-0.5 text-xs text-gray-300 focus:border-blue-500 focus:outline-none disabled:opacity-60"
              >
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <span>{item.channel}</span>
            )}
            <span>· {item.purpose?.replace(/_/g, ' ')} · {item.tone} tone</span>
            {item.source === 'workflow' && <span className="text-gray-600">· from workflow</span>}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${STATUS_COLORS[item.status] ?? ''}`}>
          {item.status}
        </span>
      </div>

      {channel === 'email' && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={!isActionable}
          placeholder="Subject"
          className="mt-3 w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none disabled:opacity-60"
        />
      )}
      <textarea
        rows={5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={!isActionable}
        className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none disabled:opacity-60"
      />

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {isActionable && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={handleApproveAndSend}
            disabled={busy || !lead}
            className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:opacity-50"
          >
            {busy ? 'Working…' : !lead ? 'Loading…' : channel === 'email' ? 'Approve & Send' : channel === 'instagram' ? 'Approve & Copy' : 'Approve & Open'}
          </button>
          <button
            onClick={handleReject}
            disabled={busy}
            className="rounded-lg border border-gray-700 px-4 py-2 text-xs font-semibold text-gray-400 transition hover:bg-gray-800 disabled:opacity-50"
          >
            Reject
          </button>
          {dirty && <span className="text-xs text-gray-600">Edited — will send this version.</span>}
        </div>
      )}
    </div>
  );
}

export default function CrmApprovals() {
  const [approvals, setApprovals] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [bulkRejecting, setBulkRejecting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'pendingApprovals'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => setApprovals(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setApprovals([]));
  }, []);

  const filtered = (approvals ?? []).filter((a) => filter === 'all' || a.status === filter);

  // Covers the case a workflow's trigger condition was too broad and drafted
  // messages for a batch of leads that didn't need one (e.g. leads already
  // contacted before the workflow existed) — clears the current filtered
  // view in one go rather than rejecting one by one.
  async function handleBulkReject() {
    const targets = filtered.filter((a) => a.status === 'pending');
    if (!targets.length) return;
    if (!window.confirm(`Reject all ${targets.length} pending draft${targets.length === 1 ? '' : 's'} shown below?`)) return;
    setBulkRejecting(true);
    try {
      const fn = httpsCallable(getFunctions(app), 'rejectApproval');
      for (const item of targets) {
        await fn({ approvalId: item.id, reason: 'Bulk rejected' });
      }
    } finally {
      setBulkRejecting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-100">Message Approvals</h2>
        <p className="mt-1 text-xs text-gray-500">
          Every AI-drafted message — whether you generated it manually or a workflow created it — lands here first. Nothing sends until you review and approve it.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl border border-gray-800 bg-gray-900 p-1 w-fit">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold capitalize transition ${
                filter === s ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {filtered.some((a) => a.status === 'pending') && (
          <button
            onClick={handleBulkReject}
            disabled={bulkRejecting}
            className="rounded-lg border border-gray-700 px-3.5 py-2 text-xs font-semibold text-gray-400 transition hover:bg-gray-800 disabled:opacity-50"
          >
            {bulkRejecting ? 'Rejecting…' : 'Reject All Pending Shown'}
          </button>
        )}
      </div>

      {approvals === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing here.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <ApprovalCard key={item.id} item={item} onChanged={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}
