import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase';
import { followUpPatchForSend } from '../../utils/crmFollowUps';

const MY_NAME = 'Dean Burt';

const CHANNELS = [
  { id: 'email', label: 'Email' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram DM' },
  { id: 'facebook', label: 'Facebook Messenger' },
  { id: 'linkedin', label: 'LinkedIn' },
];

const SEVERITY_COLOR = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-gray-400',
};

// UK-only assumption (this app's leads are all UK businesses) — strips
// formatting and swaps a leading trunk "0" for the +44 country code, since
// wa.me links need the number in international digits-only form. Duplicated
// from CrmLeadDetail.jsx/CrmApprovals.jsx rather than shared, matching this
// codebase's existing convention for this exact helper.
function formatPhoneIntl(phone) {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('44')) return digits;
  if (digits.startsWith('0')) return `44${digits.slice(1)}`;
  return digits;
}

/**
 * Growth-Audit-driven outreach generator. Positions Dean as "someone who
 * finds problems costing businesses potential customers online" rather than
 * "I build websites" — the message is only ever built from real findings
 * returned by the Growth Audit product (app.dean-da-dev.co.uk), never
 * invented. See functions/growthAuditClient.js, findingSelector.js,
 * growthAuditOutreachWriter.js, outreachQuality.js for the server side.
 *
 * The generated message is persisted on the lead doc (growthAuditOutreachMessage)
 * so it survives closing/reopening the lead — it stays until explicitly
 * deleted or overwritten by generating a new one.
 */
export default function CrmGrowthAuditOutreach({ lead, onUpdate }) {
  const saved = lead.growthAuditOutreachMessage ?? null;

  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [audit, setAudit] = useState(
    Array.isArray(lead.growthAuditFindings)
      ? { score: lead.growthAuditScore ?? null, findings: lead.growthAuditFindings, hasEnough: !!lead.growthAuditHasEnoughFindings, scannedAt: lead.growthAuditScannedAt ?? null }
      : null,
  );

  const [channel, setChannel] = useState(saved?.channel ?? 'email');
  const [includePortfolio, setIncludePortfolio] = useState(false);
  const [includeScore, setIncludeScore] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [message, setMessage] = useState(saved); // { subject, body, quality, mode, notEnoughFindings, auditUrl, findingsUsed, channel }
  const [editedBody, setEditedBody] = useState(saved?.body ?? '');
  const [showWhy, setShowWhy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  async function runAudit() {
    setAuditing(true);
    setAuditError(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'runGrowthAuditForLead', { timeout: 60000 });
      const { data } = await fn({ leadId: lead.id, leadCollection: 'crmLeads' });
      setAudit(data);
    } catch (err) {
      console.error('[CrmGrowthAuditOutreach] audit failed:', err);
      setAuditError(err?.message ?? 'Could not run the Growth Audit right now.');
    } finally {
      setAuditing(false);
    }
  }

  // Best-effort deep link to the right place to send from — WhatsApp/
  // Messenger support a pre-filled message via URL; Instagram/LinkedIn don't,
  // so those fall back to copy-to-clipboard + opening the profile.
  function openChannelDestination(chan, body) {
    if (chan === 'whatsapp') {
      const number = lead.whatsappUrl?.match(/wa\.me\/(\d+)/)?.[1] ?? formatPhoneIntl(lead.phone);
      if (!number) return false;
      window.open(`https://wa.me/${number}?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
      return true;
    }
    if (chan === 'facebook') {
      const page = lead.facebookUrl?.match(/facebook\.com\/(?:pages\/)?([^/?]+)/)?.[1];
      if (!page) return false;
      window.open(`https://m.me/${page}?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
      return true;
    }
    if (chan === 'instagram') {
      if (!lead.instagramUrl) return false;
      navigator.clipboard.writeText(body);
      window.open(lead.instagramUrl, '_blank', 'noopener');
      return true;
    }
    // LinkedIn has no pre-filled-message URL scheme — copy is the best we
    // can do; there's also no lead.linkedinUrl field on the schema to open.
    return false;
  }

  async function generate(mode = 'initial') {
    setGenerating(true);
    setGenError(null);
    setSendSuccess(false);
    try {
      const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'generateGrowthAuditOutreachNow', { timeout: 30000 });
      const { data } = await fn({
        leadId: lead.id,
        leadCollection: 'crmLeads',
        channel,
        mode,
        myName: MY_NAME,
        findings: audit?.findings,
        includePortfolio: includePortfolio && channel === 'email',
        includeScore,
      });
      const withChannel = { ...data, channel };
      setMessage(withChannel);
      setEditedBody(data.body);
      await onUpdate({ growthAuditOutreachMessage: withChannel });

      if (channel !== 'email') {
        openChannelDestination(channel, data.body);
      }
    } catch (err) {
      console.error('[CrmGrowthAuditOutreach] generation failed:', err);
      setGenError(err?.message ?? 'Could not generate a message right now.');
    } finally {
      setGenerating(false);
    }
  }

  // Persists edits made in the textarea back onto the saved message, so a
  // manual tweak isn't lost the next time the lead is reopened.
  function handleBodyBlur() {
    if (!message || editedBody === message.body) return;
    const updated = { ...message, body: editedBody };
    setMessage(updated);
    onUpdate({ growthAuditOutreachMessage: updated }).catch(() => {});
  }

  async function handleDeleteMessage() {
    setMessage(null);
    setEditedBody('');
    setSendSuccess(false);
    setSendError(null);
    await onUpdate({ growthAuditOutreachMessage: null });
  }

  function handleCopy() {
    navigator.clipboard.writeText(editedBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCopyLink() {
    if (!message?.auditUrl) return;
    navigator.clipboard.writeText(message.auditUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function handleOpenAudit() {
    if (!message?.auditUrl) return;
    window.open(message.auditUrl, '_blank', 'noopener');
  }

  function handleSendChannel() {
    const opened = openChannelDestination(channel, editedBody);
    if (!opened) handleCopy();
  }

  async function handleSendEmail() {
    if (!lead.email?.trim()) {
      setSendError('This lead has no email address on file.');
      return;
    }
    setSending(true);
    setSendError(null);
    setSendSuccess(false);
    try {
      const fn = httpsCallable(getFunctions(app), 'gmailSendEmail', { timeout: 45000 });
      const { data } = await fn({
        to: lead.email.trim(),
        subject: message.subject,
        bodyHtml: editedBody.replace(/\n/g, '<br>'),
        bodyText: editedBody,
        threadId: lead.gmailThreadId,
      });
      setSendSuccess(true);
      // Sending should advance the follow-up ladder on its own, same as the
      // old Emails-tab composer did — no manual status flip needed after.
      await onUpdate({ gmailThreadId: data.threadId, ...followUpPatchForSend(lead) });
    } catch (err) {
      console.error('[CrmGrowthAuditOutreach] send failed:', err);
      setSendError(err?.message ?? 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  const channelLabel = CHANNELS.find((c) => c.id === channel)?.label ?? channel;

  return (
    <div className="space-y-4">
      {/* Business / Website / Audit score */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-200">{lead.businessName || 'This lead'}</p>
            <p className="text-xs text-gray-500">{lead.website || 'No website on file'}</p>
          </div>
          {audit?.score != null && (
            <div className="text-right">
              <p className={`text-2xl font-bold ${audit.score >= 80 ? 'text-green-400' : audit.score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{audit.score}<span className="text-sm text-gray-500">/100</span></p>
              <p className="text-[11px] text-gray-500">Growth Audit score</p>
            </div>
          )}
        </div>

        <button
          onClick={runAudit}
          disabled={auditing || !lead.website}
          className="mt-3 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {auditing ? 'Running Growth Audit…' : audit ? 'Re-run Growth Audit' : 'Run Growth Audit'}
        </button>
        {!lead.website && <p className="mt-2 text-xs text-yellow-500">Add a website to this lead first.</p>}
        {auditError && <p className="mt-2 text-xs text-red-400">{auditError}</p>}

        {/* Top findings */}
        {audit && (
          <div className="mt-4 border-t border-gray-800 pt-3">
            {audit.findings.length === 0 ? (
              <p className="text-xs text-gray-500">No significant issues found — this site is in good shape.</p>
            ) : (
              <ul className="space-y-1.5">
                {audit.findings.map((f) => (
                  <li key={f.id} className="text-xs text-gray-400">
                    <span className={`font-semibold ${SEVERITY_COLOR[f.severity] ?? 'text-gray-400'}`}>[{f.category}]</span>{' '}
                    {f.title}
                  </li>
                ))}
              </ul>
            )}
            {!audit.hasEnough && (
              <p className="mt-2 text-xs text-gray-500">Not enough strong findings for hard-hitting personalised outreach — a softer, honest message is available below instead.</p>
            )}
          </div>
        )}
      </div>

      {audit && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
          {/* Channel selector */}
          <div className="flex flex-wrap items-center gap-2">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                onClick={() => setChannel(c.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${channel === c.id ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-400">
              <input type="checkbox" checked={includePortfolio} disabled={channel !== 'email'} onChange={(e) => setIncludePortfolio(e.target.checked)} />
              Include portfolio {channel !== 'email' && '(email only)'}
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-400">
              <input type="checkbox" checked={includeScore} onChange={(e) => setIncludeScore(e.target.checked)} />
              Include audit score
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => generate('initial')}
              disabled={generating}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? 'Writing…' : message ? 'Regenerate' : 'Generate Message'}
            </button>
            {message && (
              <>
                <button onClick={() => generate('followup1')} disabled={generating} className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-700 disabled:opacity-50">
                  Generate Follow-up 1
                </button>
                <button onClick={() => generate('followup2')} disabled={generating} className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-700 disabled:opacity-50">
                  Generate Follow-up 2
                </button>
                <button onClick={handleDeleteMessage} className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-gray-700">
                  Delete Message
                </button>
              </>
            )}
          </div>
          {genError && <p className="mt-2 text-xs text-red-400">{genError}</p>}

          {message && (
            <div className="mt-4 space-y-3">
              {message.subject ? <p className="text-xs text-gray-500">Subject: <span className="text-gray-300">{message.subject}</span></p> : null}

              <textarea
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                onBlur={handleBodyBlur}
                rows={7}
                className="w-full resize-y rounded-md border border-gray-700 bg-gray-800/50 p-3 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
              />

              {/* Primary, channel-aware send action */}
              <div className="flex flex-wrap items-center gap-2">
                {channel === 'email' ? (
                  <button
                    onClick={handleSendEmail}
                    disabled={sending || !lead.email?.trim()}
                    title={!lead.email?.trim() ? 'No email address on file for this lead' : undefined}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sending ? 'Sending…' : 'Send Email'}
                  </button>
                ) : (
                  <button
                    onClick={handleSendChannel}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    Send via {channelLabel}
                  </button>
                )}
                <button onClick={handleCopy} className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-700">
                  {copied ? 'Copied!' : 'Copy Message'}
                </button>
                <button onClick={handleCopyLink} disabled={!message.auditUrl} className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-700 disabled:opacity-50">
                  {linkCopied ? 'Copied!' : 'Copy Audit Link'}
                </button>
                <button onClick={handleOpenAudit} disabled={!message.auditUrl} className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-700 disabled:opacity-50">
                  Open Audit
                </button>
              </div>
              {channel !== 'email' && channel !== 'linkedin' && (
                <p className="text-[11px] text-gray-600">
                  Generating already tried opening {channelLabel} for you — use "Send via {channelLabel}" again if the tab didn't open (browser popup blockers sometimes catch it).
                </p>
              )}
              {channel === 'linkedin' && (
                <p className="text-[11px] text-gray-600">LinkedIn has no pre-filled-message link — "Send via LinkedIn" copies the message so you can paste it in.</p>
              )}
              {sendError && <p className="text-xs text-red-400">{sendError}</p>}
              {sendSuccess && <p className="text-xs text-emerald-400">Email sent.</p>}

              {message.quality && (
                <span className={`inline-block text-xs font-medium ${message.quality.passed ? 'text-green-400' : 'text-red-400'}`}>
                  Quality: {message.quality.score}/100 {message.quality.passed ? '' : '— review before sending'}
                </span>
              )}

              {message.quality && message.quality.issues.length > 0 && (
                <ul className="list-inside list-disc text-xs text-yellow-500">
                  {message.quality.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                </ul>
              )}

              {message.findingsUsed?.length > 0 && (
                <div className="rounded-md border border-gray-800 bg-gray-900 p-3">
                  <button onClick={() => setShowWhy((s) => !s)} className="text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-200">
                    Message based on {showWhy ? '▾' : '▸'}
                  </button>
                  <ul className="mt-2 space-y-1">
                    {message.findingsUsed.map((f) => (
                      <li key={f.id} className="text-xs text-gray-400">
                        • {f.title}
                        {showWhy && (
                          <>
                            <br />
                            <span className="pl-3 text-gray-500">
                              Evidence: {f.evidence} — Confidence: {f.measurementType}
                            </span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
