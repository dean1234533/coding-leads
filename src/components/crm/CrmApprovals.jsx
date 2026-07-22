import { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query, doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../../firebase';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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
    setBusy(true);
    setError(null);
    try {
      const approve = httpsCallable(getFunctions(app), 'approveApproval');
      await approve({ approvalId: item.id, body, subject });

      const leadSnap = await getDoc(doc(db, item.leadCollection, item.leadId));
      const lead = leadSnap.exists() ? leadSnap.data() : {};

      if (item.channel === 'email') {
        const email = lead.email;
        if (!email) throw new Error('This lead has no email address on file — add one first.');
        const send = httpsCallable(getFunctions(app), 'gmailSendEmail');
        await send({ to: email, subject: subject || '(no subject)', bodyText: body });
      } else if (item.channel === 'whatsapp') {
        const number = lead.whatsappUrl?.match(/wa\.me\/(\d+)/)?.[1] ?? formatPhoneIntl(lead.phone);
        if (!number) throw new Error('No WhatsApp number found for this lead.');
        window.open(`https://wa.me/${number}?text=${encodeURIComponent(body)}`, '_blank', 'noopener,noreferrer');
      } else if (item.channel === 'sms') {
        const number = formatPhoneIntl(lead.phone);
        if (!number) throw new Error('No phone number found for this lead.');
        window.location.href = `sms:${number}&body=${encodeURIComponent(body)}`;
      }

      const markSent = httpsCallable(getFunctions(app), 'markApprovalSent');
      await markSent({ approvalId: item.id });
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
          <p className="text-xs text-gray-500">
            {item.channel} · {item.purpose?.replace(/_/g, ' ')} · {item.tone} tone
            {item.source === 'workflow' && <span className="ml-1 text-gray-600">· from workflow</span>}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${STATUS_COLORS[item.status] ?? ''}`}>
          {item.status}
        </span>
      </div>

      {item.channel === 'email' && (
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
            disabled={busy}
            className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:opacity-50"
          >
            {busy ? 'Working…' : item.channel === 'email' ? 'Approve & Send' : 'Approve & Open'}
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
