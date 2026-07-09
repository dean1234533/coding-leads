import { useState, useEffect } from 'react';
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

  useEffect(() => { setLocal(lead); setDirty(false); }, [lead.id]);

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
