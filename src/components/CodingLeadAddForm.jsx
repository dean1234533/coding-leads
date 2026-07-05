import { useState } from 'react';
import Modal from './Modal';
import { LEAD_TYPES, STATUSES, analyzeLeadText } from '../utils/codingLeadsScoring';

const EMPTY = {
  title: '', source: 'Manual', url: '', leadType: 'Website', location: '',
  budget: '', snippet: '', contactLink: '', notes: '', status: 'New',
};

function Field({ label, id, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">{label}</label>
      {children}
    </div>
  );
}

const inputClasses = "w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 hover:border-gray-600";

export default function CodingLeadAddForm({ locationKeywords, onSave, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [leadTypeTouched, setLeadTypeTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const analysis = analyzeLeadText({
        title: form.title,
        snippet: form.snippet,
        leadTypeOverride: leadTypeTouched ? form.leadType : undefined,
        locationKeywords,
      });
      await onSave({
        ...form,
        location: form.location || analysis.location,
        leadType: analysis.leadType,
        intentScore: analysis.intentScore,
        urgencyScore: analysis.urgencyScore,
        detectedKeywords: analysis.detectedKeywords,
        scoreReasons: analysis.scoreReasons,
        suggestedOutreach: analysis.suggestedOutreach,
        manual: true,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add Coding Lead" subtitle="Manually track an opportunity you found yourself." onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Title" id="title">
          <input id="title" required autoComplete="off" className={inputClasses}
            placeholder="e.g. Small business needs a new website"
            value={form.title} onChange={set('title')} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Source" id="source">
            <input id="source" autoComplete="off" className={inputClasses}
              placeholder="e.g. Reddit, Facebook Group, referral"
              value={form.source} onChange={set('source')} />
          </Field>
          <Field label="URL" id="url">
            <input id="url" type="url" autoComplete="off" className={inputClasses}
              placeholder="https://..." value={form.url} onChange={set('url')} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Lead Type" id="leadType">
            <select id="leadType" className={inputClasses}
              value={form.leadType}
              onChange={(e) => { setLeadTypeTouched(true); setForm((p) => ({ ...p, leadType: e.target.value })); }}>
              {LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Location" id="location">
            <input id="location" autoComplete="off" className={inputClasses}
              placeholder="e.g. London, Remote" value={form.location} onChange={set('location')} />
          </Field>
          <Field label="Budget" id="budget">
            <input id="budget" autoComplete="off" className={inputClasses}
              placeholder="e.g. £500-£1000" value={form.budget} onChange={set('budget')} />
          </Field>
        </div>

        <Field label="Snippet / Description" id="snippet">
          <textarea id="snippet" rows={3} className={inputClasses}
            placeholder="Paste the relevant text from the post — used to auto-score this lead."
            value={form.snippet} onChange={set('snippet')} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Contact / Profile Link" id="contactLink">
            <input id="contactLink" type="url" autoComplete="off" className={inputClasses}
              placeholder="https://..." value={form.contactLink} onChange={set('contactLink')} />
          </Field>
          <Field label="Status" id="status">
            <select id="status" className={inputClasses} value={form.status} onChange={set('status')}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Notes" id="notes">
          <textarea id="notes" rows={2} className={inputClasses}
            placeholder="Any private notes to yourself" value={form.notes} onChange={set('notes')} />
        </Field>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-gray-400 transition hover:text-gray-200">
            Cancel
          </button>
          <button type="submit" disabled={saving || !form.title.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? 'Saving…' : 'Save Lead'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
