import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase';
import { WEBSITE_ISSUES } from '../../utils/crmConstants';

const FIELDS = [
  ['screenshotUrl', 'Website Screenshot URL', 'text', 'Paste a screenshot link (e.g. from a manual capture)'],
  ['websiteScore', 'Website Score (0-100)', 'number', ''],
  ['speedNotes', 'Website Speed Notes', 'textarea', ''],
  ['mobileNotes', 'Mobile Notes', 'textarea', ''],
  ['desktopNotes', 'Desktop Notes', 'textarea', ''],
  ['accessibilityNotes', 'Accessibility Notes', 'textarea', ''],
  ['seoNotes', 'SEO Notes', 'textarea', ''],
  ['overallImpression', 'Overall Impression', 'textarea', ''],
];

export default function CrmWebsiteReview({ lead, onUpdate }) {
  const [local, setLocal] = useState(lead);
  const [dirty, setDirty] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState(null);

  useEffect(() => { setLocal(lead); setDirty(false); setAuditError(null); }, [lead.id]);

  // A lead can end up with a blank or failed audit for all sorts of
  // reasons — the scan hit a rate limit, the site was down for a minute,
  // every AI vision provider happened to be dry at once. Rather than being
  // stuck manually filling in every field, this re-runs the exact same
  // automated audit (PageSpeed + AI vision) used everywhere else in the app
  // on demand, against this one lead's current website.
  async function handleRerunAudit() {
    if (!local.website) return;
    setAuditing(true);
    setAuditError(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'auditWebsitesNow', { timeout: 60000 });
      const { data } = await fn({ urls: [local.website] });
      const audit = data.results?.[local.website];
      if (!audit) {
        setAuditError('No result came back — try again in a moment.');
        return;
      }
      if (audit.auditFailed) {
        setAuditError(`Audit failed: ${audit.error}`);
        // Still worth saving — a broken-link/404 finding is itself useful
        // information, same as the automated scan pipelines treat it.
      }
      const patch = {
        websiteScore: audit.websiteScore ?? null,
        issuesChecklist: audit.issuesChecklist ?? [],
        speedNotes: audit.speedNotes ?? null,
        mobileNotes: audit.mobileNotes ?? null,
        seoNotes: audit.seoNotes ?? null,
        overallImpression: audit.auditFailed
          ? `Auto-audit failed (${audit.error})`
          : audit.overallImpression ?? null,
        aiDesignNote: audit.aiDesignNote ?? null,
      };
      await onUpdate(patch);
      setLocal((l) => ({ ...l, ...patch }));
      setDirty(false);
    } catch (err) {
      console.error('[CrmWebsiteReview] re-run audit failed:', err);
      setAuditError(err?.message ?? 'Audit failed.');
    } finally {
      setAuditing(false);
    }
  }

  function setField(key, value) {
    setLocal((l) => ({ ...l, [key]: value }));
    setDirty(true);
  }

  function toggleIssue(issue) {
    const current = local.issuesChecklist ?? [];
    const next = current.includes(issue) ? current.filter((i) => i !== issue) : [...current, issue];
    setField('issuesChecklist', next);
  }

  async function handleSave() {
    const patch = {};
    FIELDS.forEach(([key]) => { patch[key] = local[key] ?? null; });
    patch.issuesChecklist = local.issuesChecklist ?? [];
    await onUpdate(patch);
    setDirty(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-800 bg-gray-800/30 p-3">
        <button
          onClick={handleRerunAudit}
          disabled={auditing || !local.website}
          title={!local.website ? 'No website on this lead to audit' : 'Runs the automated PageSpeed + AI vision audit against this website again'}
          className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {auditing ? 'Auditing…' : 'Re-run Audit'}
        </button>
        <span className="text-xs text-gray-500">
          {local.website ? 'Re-runs the same automated audit used everywhere else — useful if this lead scanned badly or never got audited.' : 'Add a website in the Overview tab to enable auditing.'}
        </span>
      </div>
      {auditError && <p className="text-xs text-red-400">{auditError}</p>}

      {local.screenshotUrl && (
        <img src={local.screenshotUrl} alt="Website screenshot" className="w-full rounded-lg border border-gray-800 object-cover" />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map(([key, label, type, placeholder]) => (
          <label key={key} className={`flex flex-col gap-1.5 ${type === 'textarea' ? 'sm:col-span-2' : ''}`}>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">{label}</span>
            {type === 'textarea' ? (
              <textarea
                rows={2}
                value={local[key] ?? ''}
                onChange={(e) => setField(key, e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            ) : (
              <input
                type={type}
                value={local[key] ?? ''}
                onChange={(e) => setField(key, e.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
          </label>
        ))}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-500">Website Issues</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {WEBSITE_ISSUES.map((issue) => {
            const checked = (local.issuesChecklist ?? []).includes(issue);
            return (
              <label
                key={issue}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${
                  checked ? 'border-blue-500/40 bg-blue-500/10 text-blue-300' : 'border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleIssue(issue)} className="accent-blue-500" />
                {issue}
              </label>
            );
          })}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!dirty}
        className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Save Website Review
      </button>
    </div>
  );
}
