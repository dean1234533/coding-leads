import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase';

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

/**
 * Growth-Audit-driven outreach generator. Positions Dean as "someone who
 * finds problems costing businesses potential customers online" rather than
 * "I build websites" — the message is only ever built from real findings
 * returned by the Growth Audit product (app.dean-da-dev.co.uk), never
 * invented. See functions/growthAuditClient.js, findingSelector.js,
 * growthAuditOutreachWriter.js, outreachQuality.js for the server side.
 */
export default function CrmGrowthAuditOutreach({ lead }) {
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [audit, setAudit] = useState(
    Array.isArray(lead.growthAuditFindings)
      ? { score: lead.growthAuditScore ?? null, findings: lead.growthAuditFindings, hasEnough: !!lead.growthAuditHasEnoughFindings, scannedAt: lead.growthAuditScannedAt ?? null }
      : null,
  );

  const [channel, setChannel] = useState('email');
  const [includePortfolio, setIncludePortfolio] = useState(false);
  const [includeScore, setIncludeScore] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(null);
  const [message, setMessage] = useState(null); // { subject, body, quality, mode, notEnoughFindings }
  const [editedBody, setEditedBody] = useState('');
  const [showWhy, setShowWhy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function runAudit() {
    setAuditing(true);
    setAuditError(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'runGrowthAuditForLead', { timeout: 60000 });
      const { data } = await fn({ leadId: lead.id, leadCollection: 'crmLeads' });
      setAudit(data);
      setMessage(null);
    } catch (err) {
      console.error('[CrmGrowthAuditOutreach] audit failed:', err);
      setAuditError(err?.message ?? 'Could not run the Growth Audit right now.');
    } finally {
      setAuditing(false);
    }
  }

  async function generate(mode = 'initial') {
    setGenerating(true);
    setGenError(null);
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
      setMessage(data);
      setEditedBody(data.body);
    } catch (err) {
      console.error('[CrmGrowthAuditOutreach] generation failed:', err);
      setGenError(err?.message ?? 'Could not generate a message right now.');
    } finally {
      setGenerating(false);
    }
  }

  const [linkCopied, setLinkCopied] = useState(false);

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
                rows={7}
                className="w-full resize-y rounded-md border border-gray-700 bg-gray-800/50 p-3 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
              />

              <div className="flex flex-wrap items-center gap-2">
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
