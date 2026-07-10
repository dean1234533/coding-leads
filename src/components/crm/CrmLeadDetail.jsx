import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase';
import Modal from '../Modal';
import { STATUSES, PRIORITIES, INDUSTRIES, STATUS_COLORS } from '../../utils/crmConstants';
import { computeNextFollowUp, followUpPatchForSend } from '../../utils/crmFollowUps';
import CrmWebsiteReview from './CrmWebsiteReview';
import CrmNotesTimeline from './CrmNotesTimeline';
import CrmTasksList from './CrmTasksList';
import CrmComposer from './CrmComposer';
import CrmCallScript from './CrmCallScript';

const TABS = ['Overview', 'Website Review', 'Notes', 'Tasks', 'Emails', 'Call Script'];

// Every core lead field is editable in place — saves on blur (or on change
// for selects), so bad/missing data (e.g. a lead auto-created with an email
// address standing in for a business name) can actually be corrected instead
// of being stuck forever short of deleting and losing the lead's history.
function EditableField({ label, value, onSave, type = 'text' }) {
  const [val, setVal] = useState(value ?? '');
  useEffect(() => setVal(value ?? ''), [value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">{label}</span>
      <input
        type={type}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { if (val !== (value ?? '')) onSave(val); }}
        className="rounded-lg border border-gray-800 bg-gray-800/30 px-2.5 py-1.5 text-sm text-gray-200 transition focus:border-blue-500 focus:bg-gray-800/60 focus:outline-none"
      />
    </label>
  );
}

function EditableSelect({ label, value, options, onSave }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onSave(e.target.value)}
        className="rounded-lg border border-gray-800 bg-gray-800/30 px-2.5 py-1.5 text-sm text-gray-200 transition focus:border-blue-500 focus:bg-gray-800/60 focus:outline-none"
      >
        <option value="" className="bg-gray-900">—</option>
        {options.map((o) => <option key={o} value={o} className="bg-gray-900">{o}</option>)}
      </select>
    </label>
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
    // Sending an email should advance the follow-up ladder on its own —
    // no more manually flipping the status dropdown after every send.
    await onUpdate({ gmailThreadId: threadId, ...followUpPatchForSend(lead) });
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
          <EditableField label="Business Name" value={lead.businessName} onSave={(v) => onUpdate({ businessName: v })} />
          <EditableField label="Contact Name" value={lead.contactName} onSave={(v) => onUpdate({ contactName: v })} />
          <div>
            <EditableField label="Email" type="email" value={lead.email} onSave={(v) => onUpdate({ email: v })} />
            {!lead.email && lead.website && lead.contactName && (
              <button onClick={handleFindEmail} disabled={findingEmail}
                className="mt-1 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50">
                {findingEmail ? 'Searching…' : 'Find Email'}
              </button>
            )}
            {findEmailError && <p className="mt-1 text-xs text-red-400">{findEmailError}</p>}
          </div>
          <EditableField label="Phone" value={lead.phone} onSave={(v) => onUpdate({ phone: v })} />
          <EditableField label="Website" value={lead.website} onSave={(v) => onUpdate({ website: v })} />
          <EditableField label="Address" value={lead.address} onSave={(v) => onUpdate({ address: v })} />
          <EditableSelect label="Industry" value={lead.industry} options={INDUSTRIES} onSave={(v) => onUpdate({ industry: v })} />
          <EditableField label="Lead Score" type="number" value={lead.leadScore} onSave={(v) => onUpdate({ leadScore: v ? Number(v) : null })} />
          <EditableField label="Estimated Value (£)" type="number" value={lead.estimatedProjectValue} onSave={(v) => onUpdate({ estimatedProjectValue: v ? Number(v) : null })} />
          <EditableField label="Source" value={lead.source} onSave={(v) => onUpdate({ source: v })} />
          <EditableField label="Next Action" value={lead.nextAction} onSave={(v) => onUpdate({ nextAction: v })} />
          <EditableField label="Tags (comma separated)" value={(lead.tags ?? []).join(', ')} onSave={(v) => onUpdate({ tags: v.split(',').map((t) => t.trim()).filter(Boolean) })} />
          <EditableField label="Google Maps URL" value={lead.googleMapsUrl} onSave={(v) => onUpdate({ googleMapsUrl: v })} />
          {lead.googleMapsUrl && (
            <a href={lead.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="self-end text-sm text-blue-400 hover:text-blue-300">
              Open in Google Maps →
            </a>
          )}
          <div className="col-span-2 sm:col-span-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">Notes</span>
              <textarea
                rows={3}
                defaultValue={lead.notes ?? ''}
                onBlur={(e) => { if (e.target.value !== (lead.notes ?? '')) onUpdate({ notes: e.target.value }); }}
                className="rounded-lg border border-gray-800 bg-gray-800/30 px-2.5 py-1.5 text-sm text-gray-200 transition focus:border-blue-500 focus:bg-gray-800/60 focus:outline-none"
              />
            </label>
          </div>
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
      {tab === 'Call Script' && <CrmCallScript lead={lead} />}
    </Modal>
  );
}
