import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase';
import Modal from '../Modal';
import { STATUSES, PRIORITIES, STATUS_COLORS } from '../../utils/crmConstants';
import { computeNextFollowUp } from '../../utils/crmFollowUps';
import CrmWebsiteReview from './CrmWebsiteReview';
import CrmNotesTimeline from './CrmNotesTimeline';
import CrmTasksList from './CrmTasksList';
import CrmComposer from './CrmComposer';

const TABS = ['Overview', 'Website Review', 'Notes', 'Tasks', 'Emails'];

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">{label}</p>
      <p className="mt-0.5 truncate text-sm text-gray-200">{value || '—'}</p>
    </div>
  );
}

export default function CrmLeadDetail({ lead, onUpdate, onDelete, onClose }) {
  const [tab, setTab] = useState('Overview');
  const [findingEmail, setFindingEmail] = useState(false);
  const [findEmailError, setFindEmailError] = useState(null);
  const cfg = STATUS_COLORS[lead.status] ?? STATUS_COLORS['New'];

  async function handleFindEmail() {
    setFindingEmail(true);
    setFindEmailError(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'findLeadEmail');
      const { data } = await fn({ website: lead.website, contactName: lead.contactName });
      if (data.email) {
        await onUpdate({ email: data.email });
      } else {
        setFindEmailError('No email found.');
      }
    } catch (err) {
      setFindEmailError(err?.message ?? 'Lookup failed.');
    } finally {
      setFindingEmail(false);
    }
  }

  async function handleStatusChange(status) {
    const patch = { status };
    if (status === 'Email Sent') {
      patch.followUpDate = computeNextFollowUp(0, new Date());
      patch.followUpStage = 0;
      patch.lastContactDate = new Date();
    }
    await onUpdate(patch);
  }

  async function logFollowUp() {
    const stage = (lead.followUpStage ?? 0) + 1;
    const next = computeNextFollowUp(stage, new Date());
    await onUpdate({
      followUpStage: stage,
      followUpDate: next,
      status: next ? 'Follow Up Due' : 'Archive',
      lastContactDate: new Date(),
    });
  }

  async function handleThreadLinked(threadId) {
    if (!threadId) return;
    await onUpdate({ gmailThreadId: threadId, lastContactDate: new Date() });
  }

  return (
    <Modal
      title={lead.businessName || 'Lead'}
      subtitle={lead.industry || lead.website || undefined}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={lead.status || 'New'} onChange={(e) => handleStatusChange(e.target.value)}
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset focus:outline-none ${cfg.bg} ${cfg.text}`}>
          {STATUSES.map((s) => <option key={s} value={s} className="bg-gray-900 text-gray-100">{s}</option>)}
        </select>
        <select value={lead.priority || 'Medium'} onChange={(e) => onUpdate({ priority: e.target.value })}
          className="rounded-full bg-gray-800 px-3 py-1 text-xs font-medium text-gray-300 focus:outline-none">
          {PRIORITIES.map((p) => <option key={p} value={p} className="bg-gray-900">{p} priority</option>)}
        </select>
        <button onClick={logFollowUp} className="rounded-full bg-gray-800 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-700">
          Log Follow-Up Sent
        </button>
        <button onClick={() => { onDelete(lead.id); onClose(); }} className="ml-auto text-xs text-gray-600 hover:text-red-400">
          Delete lead
        </button>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-800">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap px-3 py-2 text-xs font-semibold border-b-2 transition ${
              tab === t ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Contact Name" value={lead.contactName} />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Email</p>
            {lead.email ? (
              <p className="mt-0.5 truncate text-sm text-gray-200">{lead.email}</p>
            ) : lead.website && lead.contactName ? (
              <button onClick={handleFindEmail} disabled={findingEmail}
                className="mt-0.5 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50">
                {findingEmail ? 'Searching…' : 'Find Email'}
              </button>
            ) : (
              <p className="mt-0.5 text-sm text-gray-600">—</p>
            )}
            {findEmailError && <p className="mt-0.5 text-xs text-red-400">{findEmailError}</p>}
          </div>
          <Field label="Phone" value={lead.phone} />
          <Field label="Website" value={lead.website} />
          <Field label="Address" value={lead.address} />
          <Field label="Industry" value={lead.industry} />
          <Field label="Lead Score" value={lead.leadScore} />
          <Field label="Estimated Value" value={lead.estimatedProjectValue ? `£${Number(lead.estimatedProjectValue).toLocaleString()}` : null} />
          <Field label="Source" value={lead.source} />
          <Field label="Next Action" value={lead.nextAction} />
          <Field label="Tags" value={(lead.tags ?? []).join(', ')} />
          <Field label="Follow Up Date" value={lead.followUpDate ? (lead.followUpDate.toDate?.() ?? new Date(lead.followUpDate)).toLocaleDateString('en-GB') : null} />
          {lead.googleMapsUrl && (
            <a href={lead.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 col-span-2 sm:col-span-3">
              Open in Google Maps →
            </a>
          )}
          {lead.notes && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Notes</p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-gray-300">{lead.notes}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'Website Review' && <CrmWebsiteReview lead={lead} onUpdate={onUpdate} />}
      {tab === 'Notes' && <CrmNotesTimeline leadId={lead.id} />}
      {tab === 'Tasks' && <CrmTasksList leadId={lead.id} />}
      {tab === 'Emails' && (
        <div className="space-y-3">
          {lead.gmailThreadId && (
            <p className="text-xs text-gray-500">Linked to Gmail thread <code className="text-gray-400">{lead.gmailThreadId}</code></p>
          )}
          <CrmComposer
            lead={lead}
            defaultTo={lead.email}
            defaultSubject={lead.businessName ? `Regarding ${lead.businessName}` : ''}
            threadId={lead.gmailThreadId}
            onSent={handleThreadLinked}
            onSaved={() => {}}
          />
        </div>
      )}
    </Modal>
  );
}
