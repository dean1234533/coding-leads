import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../../firebase';
import { applyTemplateVars } from '../../utils/crmConstants';
import { computeNextFollowUp } from '../../utils/crmFollowUps';
import Modal from '../Modal';

const MY_NAME = 'Dean Burt';
const SEND_DELAY_MS = 1500; // throttle between sends — avoids Gmail rate/abuse limits

function leadVars(lead) {
  return {
    business: lead.businessName ?? '',
    contact: lead.contactName?.trim() || 'there',
    website: lead.website ?? '',
    industry: lead.industry ?? '',
    issue: (lead.issuesChecklist ?? [])[0] ?? '',
    myname: MY_NAME,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function CrmBulkSendModal({ leads, onClose, onDone }) {
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState({}); // leadId -> 'pending' | 'sent' | 'failed' | 'skipped'
  const [errors, setErrors] = useState({}); // leadId -> error message
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    return onSnapshot(query(collection(db, 'crmTemplates'), orderBy('name')), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTemplates(list);
      if (!templateId && list.length) setTemplateId(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const template = templates.find((t) => t.id === templateId);
  const withEmail = leads.filter((l) => l.email?.trim());
  const withoutEmail = leads.filter((l) => !l.email?.trim());
  const previewLead = withEmail[0] ?? leads[0];

  async function handleSend() {
    if (!template || withEmail.length === 0) return;
    setSending(true);
    setFinished(false);

    const initial = {};
    leads.forEach((l) => { initial[l.id] = withoutEmail.includes(l) ? 'skipped' : 'pending'; });
    setResults(initial);

    for (const lead of withEmail) {
      try {
        const vars = leadVars(lead);
        const subject = applyTemplateVars(template.subject, vars);
        const bodyHtml = applyTemplateVars(template.body, vars).replace(/\n/g, '<br>');

        const fn = httpsCallable(getFunctions(app), 'gmailSendEmail');
        const { data } = await fn({ to: lead.email.trim(), subject, bodyHtml });

        const followUpDate = computeNextFollowUp(0, new Date());
        await updateDoc(doc(db, 'crmLeads', lead.id), {
          status: 'Email Sent',
          gmailThreadId: data.threadId,
          followUpDate,
          followUpStage: 0,
          lastContactDate: new Date(),
          updatedAt: serverTimestamp(),
        });

        setResults((r) => ({ ...r, [lead.id]: 'sent' }));
      } catch (err) {
        setResults((r) => ({ ...r, [lead.id]: 'failed' }));
        setErrors((e) => ({ ...e, [lead.id]: err?.message ?? 'Send failed.' }));
      }
      await sleep(SEND_DELAY_MS);
    }

    setSending(false);
    setFinished(true);
  }

  const sentCount = Object.values(results).filter((s) => s === 'sent').length;
  const failedCount = Object.values(results).filter((s) => s === 'failed').length;

  return (
    <Modal title={`Send Email to ${leads.length} Lead${leads.length === 1 ? '' : 's'}`} onClose={onClose} maxWidth="max-w-xl">
      {!sending && !finished && (
        <div className="space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Template</span>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              {templates.length === 0 && <option value="">No templates yet — add one first</option>}
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>

          {template && previewLead && (
            <div className="rounded-lg border border-gray-800 bg-gray-950/60 p-3 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-600">
                Preview — {previewLead.businessName || 'first lead'}
              </p>
              <p className="text-sm font-medium text-gray-200">{applyTemplateVars(template.subject, leadVars(previewLead))}</p>
              <p className="whitespace-pre-line text-xs text-gray-400">{applyTemplateVars(template.body, leadVars(previewLead))}</p>
            </div>
          )}

          <div className="text-xs text-gray-500">
            {withEmail.length} will be emailed{withoutEmail.length > 0 ? `, ${withoutEmail.length} skipped (no email address)` : ''}.
            Sends one at a time (~{(SEND_DELAY_MS / 1000).toFixed(1)}s apart) to keep things safe.
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSend}
              disabled={!template || withEmail.length === 0}
              className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send to {withEmail.length} Lead{withEmail.length === 1 ? '' : 's'}
            </button>
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-300">Cancel</button>
          </div>
        </div>
      )}

      {(sending || finished) && (
        <div className="space-y-4">
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {leads.map((lead) => {
              const status = results[lead.id];
              return (
                <div key={lead.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-800/30 px-3 py-2">
                  <span className="truncate text-sm text-gray-200">{lead.businessName || 'Untitled lead'}</span>
                  {status === 'sent' && <span className="text-xs font-medium text-emerald-400">✓ Sent</span>}
                  {status === 'failed' && <span className="text-xs font-medium text-red-400" title={errors[lead.id]}>✗ Failed</span>}
                  {status === 'skipped' && <span className="text-xs text-gray-500">Skipped — no email</span>}
                  {status === 'pending' && <span className="text-xs text-gray-500">Sending…</span>}
                </div>
              );
            })}
          </div>

          {finished && (
            <>
              <div className="rounded-lg border border-gray-800 bg-gray-950/60 px-4 py-3 text-sm text-gray-300">
                {sentCount} sent{failedCount > 0 ? `, ${failedCount} failed` : ''}{withoutEmail.length > 0 ? `, ${withoutEmail.length} skipped (no email)` : ''}.
              </div>
              <button onClick={onDone}
                className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400">
                Done
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
