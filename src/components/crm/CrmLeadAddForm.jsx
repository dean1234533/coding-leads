import { useState } from 'react';
import Modal from '../Modal';
import { STATUSES, PRIORITIES, INDUSTRIES, SOURCES } from '../../utils/crmConstants';

const EMPTY = {
  businessName: '', website: '', email: '', phone: '', contactName: '',
  industry: '', address: '', googleMapsUrl: '', notes: '',
  status: 'New', leadScore: '', nextAction: '', tags: '', source: '',
  priority: 'Medium', estimatedProjectValue: '',
};

function Field({ label, ...props }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">{label}</span>
      <input
        {...props}
        className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 hover:border-gray-600"
      />
    </label>
  );
}

function Select({ label, options, ...props }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">{label}</span>
      <select
        {...props}
        className="w-full appearance-none rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 hover:border-gray-600 cursor-pointer"
      >
        {options.map((o) => <option key={o} value={o} className="bg-gray-900">{o}</option>)}
      </select>
    </label>
  );
}

export default function CrmLeadAddForm({ onSave, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.businessName.trim()) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        leadScore: form.leadScore ? Number(form.leadScore) : null,
        estimatedProjectValue: form.estimatedProjectValue ? Number(form.estimatedProjectValue) : null,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Lead" subtitle="Every business becomes a lead you can track through the pipeline." onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Business Name *" required value={form.businessName} onChange={set('businessName')} placeholder="Riverside Gym" />
          <Field label="Website" value={form.website} onChange={set('website')} placeholder="https://example.com" />
          <Field label="Email" type="email" value={form.email} onChange={set('email')} placeholder="contact@business.com" />
          <Field label="Phone" value={form.phone} onChange={set('phone')} placeholder="07123 456789" />
          <Field label="Contact Name" value={form.contactName} onChange={set('contactName')} placeholder="Jane Smith" />
          <Select label="Industry" options={['', ...INDUSTRIES]} value={form.industry} onChange={set('industry')} />
          <Field label="Address" value={form.address} onChange={set('address')} placeholder="123 High Street, London" />
          <Field label="Google Maps URL" value={form.googleMapsUrl} onChange={set('googleMapsUrl')} placeholder="https://maps.google.com/..." />
          <Select label="Status" options={STATUSES} value={form.status} onChange={set('status')} />
          <Select label="Priority" options={PRIORITIES} value={form.priority} onChange={set('priority')} />
          <Field label="Lead Score (0-100)" type="number" min="0" max="100" value={form.leadScore} onChange={set('leadScore')} />
          <Field label="Estimated Project Value (£)" type="number" min="0" value={form.estimatedProjectValue} onChange={set('estimatedProjectValue')} />
          <Select label="Source" options={['', ...SOURCES]} value={form.source} onChange={set('source')} />
          <Field label="Tags (comma separated)" value={form.tags} onChange={set('tags')} placeholder="hot, referral" />
          <Field label="Next Action" value={form.nextAction} onChange={set('nextAction')} placeholder="Call to introduce" />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">Notes</span>
          <textarea
            rows={3}
            value={form.notes}
            onChange={set('notes')}
            placeholder="Any general notes about this lead…"
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !form.businessName.trim()}
            className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save Lead'}
          </button>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-300">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
