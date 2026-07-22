import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase';

const TONES = ['Professional', 'Friendly', 'Premium', 'Casual', 'Local'];
const PURPOSES = [
  { value: 'sales_reply', label: 'Sales Reply' },
  { value: 'follow_up', label: 'Follow-Up' },
  { value: 'quote_response', label: 'Quote Response' },
  { value: 'reactivation', label: 'Reactivation' },
  { value: 'review_request', label: 'Review Request' },
  { value: 'general', label: 'General' },
];
const CHANNELS = ['email', 'whatsapp', 'sms'];

export default function CrmAiDraftWidget({ lead }) {
  const [tone, setTone] = useState('Professional');
  const [purpose, setPurpose] = useState('sales_reply');
  const [channel, setChannel] = useState('email');
  const [customerMessage, setCustomerMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'generateCommsMessage', { timeout: 30000 });
      const { data } = await fn({
        leadId: lead.id,
        leadCollection: 'crmLeads',
        leadName: lead.businessName || lead.contactName || '',
        channel, purpose, tone,
        customerMessage: customerMessage || lead.notes || '',
        source: 'manual',
      });
      setResult(data);
    } catch (err) {
      setError(err?.message ?? 'Failed to generate.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3">
      <p className="text-xs font-semibold text-gray-300">AI Draft a Message</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <select value={purpose} onChange={(e) => setPurpose(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800/50 px-2 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none">
          {PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select value={tone} onChange={(e) => setTone(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800/50 px-2 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none">
          {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={channel} onChange={(e) => setChannel(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800/50 px-2 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none">
          {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <textarea
        rows={2}
        value={customerMessage}
        onChange={(e) => setCustomerMessage(e.target.value)}
        placeholder="Paste what they said (optional — falls back to Notes)"
        className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
      />
      <button
        onClick={handleGenerate}
        disabled={busy}
        className="mt-2 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:opacity-50"
      >
        {busy ? 'Generating…' : 'Generate Draft'}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {result && (
        <p className="mt-2 text-xs text-emerald-400">Draft saved to Approvals — review and send it from the Approvals tab.</p>
      )}
    </div>
  );
}
