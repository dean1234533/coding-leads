import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { app, db } from '../../firebase';
import Modal from '../Modal';
import { STATUSES, PRIORITIES, INDUSTRIES, STATUS_COLORS, applyTemplateVars, buildTemplateVars } from '../../utils/crmConstants';
import { computeNextFollowUp, followUpPatchForSend } from '../../utils/crmFollowUps';
import CrmWebsiteReview from './CrmWebsiteReview';
import CrmNotesTimeline from './CrmNotesTimeline';
import CrmTasksList from './CrmTasksList';
import CrmComposer from './CrmComposer';
import CrmCallScript from './CrmCallScript';
import CrmAiDraftWidget from './CrmAiDraftWidget';

const TABS = ['Overview', 'Website Review', 'Notes', 'Tasks', 'Emails', 'Call Script'];
const MY_NAME = 'Dean Burt';

// Instagram has no send API, so this is a copy-the-caption /
// download-the-flyer-and-attach-it-by-hand workflow rather than an
// automated send like the Emails tab's CrmComposer.
function CrmInstagramOutreach({ lead }) {
  const [templates, setTemplates] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'crmTemplates'), where('category', '==', 'Instagram'));
    return onSnapshot(q, (snap) => setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setTemplates([]));
  }, []);

  if (!templates || templates.length === 0) return null;
  // More than one Instagram template exists (e.g. a general idea-offer vs a
  // Bookrightly-specific pitch) — let Dean pick which fits this lead rather
  // than silently always using whichever one the query happens to return first.
  const template = templates.find((t) => t.id === selectedId) ?? templates[0];
  const caption = applyTemplateVars(template.body, buildTemplateVars(lead, { myName: MY_NAME }));

  function handleCopy() {
    navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-1 flex items-start gap-3 rounded-lg border border-gray-800 bg-gray-900/60 p-3">
      {template.imageUrl && (
        <img src={template.imageUrl} alt="" className="h-20 w-20 flex-shrink-0 rounded-md object-cover object-top" />
      )}
      <div className="min-w-0 flex-1">
        {templates.length > 1 ? (
          <select
            value={template.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded border border-gray-700 bg-gray-800/50 px-1.5 py-0.5 text-xs font-semibold text-pink-400 focus:border-pink-500 focus:outline-none"
          >
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        ) : (
          <p className="text-xs font-semibold text-pink-400">{template.name}</p>
        )}
        <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-gray-500">{caption}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button onClick={handleCopy} className="text-xs font-medium text-blue-400 hover:text-blue-300">
            {copied ? 'Copied!' : 'Copy caption'}
          </button>
          {template.imageUrl && (
            <a href={template.imageUrl} download className="text-xs font-medium text-blue-400 hover:text-blue-300">
              Download flyer
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// UK-only assumption (this app's leads are all UK businesses) — strips
// formatting and swaps a leading trunk "0" for the +44 country code, since
// wa.me/sms: links need the number in international digits-only form, not
// however it was typed in ("020 1234 5678", "07123-456789", etc.).
function formatPhoneIntl(phone) {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('44')) return digits;
  if (digits.startsWith('0')) return `44${digits.slice(1)}`;
  return digits;
}

// Unlike Instagram, both WhatsApp and SMS support a pre-filled message via
// URL (wa.me's `text` param, the sms: URI's `body` param) — no manual
// copy-paste needed, the link opens the chat with the message already
// typed in, just needs Dean to hit send himself (there's no send API for
// either, same reason as Instagram).
// A template belongs to a channel if its primary category matches, or its
// optional `channels` array lists it — the latter lets one template (e.g.
// the "Free Mockup" pitch) be offered on more than one channel without
// duplicating the content.
function templatesForChannel(templates, channel) {
  return templates.filter((t) => t.category === channel || t.channels?.includes(channel));
}

function CrmPhoneOutreach({ lead }) {
  const [templates, setTemplates] = useState(null);
  const [whatsappId, setWhatsappId] = useState(null);
  const [smsId, setSmsId] = useState(null);

  useEffect(() => {
    // Fetches the whole (small) template library rather than a `category`
    // filter — a `channels` array match can't be expressed as a simple
    // Firestore `where` alongside the category check without a second query,
    // and this collection is small enough that client-side filtering is fine.
    return onSnapshot(collection(db, 'crmTemplates'), (snap) => setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setTemplates([]));
  }, []);

  if (!templates || templates.length === 0) return null;
  const whatsappOptions = templatesForChannel(templates, 'WhatsApp');
  // Same options as WhatsApp — texting the same short, personal pitch on
  // whichever channel a lead actually has a working number for.
  const smsOptions = whatsappOptions;
  const whatsapp = whatsappOptions.find((t) => t.id === whatsappId) ?? whatsappOptions[0];
  const sms = smsOptions.find((t) => t.id === smsId) ?? smsOptions[0];

  // Prefer a WhatsApp number the business actually put on their own site
  // (scraped during the scan — see findWhatsAppLink in functions/index.js)
  // over guessing one from the regular contact number, since plenty of
  // businesses run a dedicated WhatsApp line separate from their landline.
  const whatsappNumber = lead.whatsappUrl?.match(/wa\.me\/(\d+)/)?.[1] ?? formatPhoneIntl(lead.phone);
  const smsNumber = formatPhoneIntl(lead.phone);
  if (!whatsappNumber && !smsNumber) return null;

  const vars = buildTemplateVars(lead, { myName: MY_NAME });
  const selectClasses = "rounded border border-gray-700 bg-gray-800/50 px-1.5 py-0.5 text-xs font-medium focus:outline-none";

  return (
    <div className="mt-1 flex flex-wrap items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/60 p-3">
      {whatsapp && whatsappNumber && (
        <span className="flex items-center gap-1.5">
          <a
            href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(applyTemplateVars(whatsapp.body, vars))}`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
          >
            Message on WhatsApp {lead.whatsappUrl ? '(number found on their site) ' : ''}→
          </a>
          {whatsappOptions.length > 1 && (
            <select value={whatsapp.id} onChange={(e) => setWhatsappId(e.target.value)} className={`${selectClasses} text-emerald-400 focus:border-emerald-500`}>
              {whatsappOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </span>
      )}
      {sms && smsNumber && (
        <span className="flex items-center gap-1.5">
          <a
            href={`sms:${smsNumber}&body=${encodeURIComponent(applyTemplateVars(sms.body, vars))}`}
            className="text-xs font-medium text-blue-400 hover:text-blue-300"
          >
            Send Text →
          </a>
          {smsOptions.length > 1 && (
            <select value={sms.id} onChange={(e) => setSmsId(e.target.value)} className={`${selectClasses} text-blue-400 focus:border-blue-500`}>
              {smsOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </span>
      )}
    </div>
  );
}

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
      status: next ? 'Follow Up Scheduled' : 'Archive',
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
            {!lead.email && lead.website && (
              <button onClick={handleFindEmail} disabled={findingEmail}
                className="mt-1 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50">
                {findingEmail ? 'Searching…' : 'Find Email'}
              </button>
            )}
            {findEmailError && <p className="mt-1 text-xs text-red-400">{findEmailError}</p>}
          </div>
          <div className="col-span-2 sm:col-span-3">
            <EditableField label="Phone" value={lead.phone} onSave={(v) => onUpdate({ phone: v })} />
            {lead.phone && (
              <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} className="mt-1 inline-block text-xs text-blue-400 hover:text-blue-300">
                Call →
              </a>
            )}
            <CrmPhoneOutreach lead={lead} />
          </div>
          <div>
            <EditableField label="Website" value={lead.website} onSave={(v) => onUpdate({ website: v })} />
            {lead.website && (
              <a href={/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-blue-400 hover:text-blue-300">
                Open site →
              </a>
            )}
          </div>
          <div className="col-span-2 sm:col-span-3">
            <EditableField label="Instagram" value={lead.instagramUrl} onSave={(v) => onUpdate({ instagramUrl: v })} />
            {lead.instagramUrl && (
              <a href={lead.instagramUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-pink-400 hover:text-pink-300">
                Open Instagram →
              </a>
            )}
            {lead.instagramUrl && <CrmInstagramOutreach lead={lead} />}
          </div>
          <div className="col-span-2 sm:col-span-3">
            <EditableField label="WhatsApp Link (auto-detected from their site, if found)" value={lead.whatsappUrl} onSave={(v) => onUpdate({ whatsappUrl: v })} />
          </div>
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
          <div className="col-span-2 sm:col-span-3">
            <CrmAiDraftWidget lead={lead} />
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
