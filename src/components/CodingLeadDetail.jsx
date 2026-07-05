import { useState } from 'react';
import Modal from './Modal';
import { StatusBadge, LeadTypeBadge, ScoreBadge } from './CodingLeadsTable';
import { STATUSES, generateOutreachMessage } from '../utils/codingLeadsScoring';

function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate?.() ?? new Date(timestamp);
  return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Section({ label, children }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-500">{label}</p>
      {children}
    </div>
  );
}

export default function CodingLeadDetail({ lead, onUpdate, onDelete, onClose }) {
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [outreach, setOutreach] = useState(lead.suggestedOutreach ?? '');
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(outreach).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleRegenerate() {
    const msg = generateOutreachMessage(lead.leadType);
    setOutreach(msg);
    onUpdate(lead.id, { suggestedOutreach: msg });
  }

  return (
    <Modal
      title={lead.title}
      subtitle={`${lead.source ?? 'Unknown source'} · Found ${formatDate(lead.createdAt)}`}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={lead.status} />
          <LeadTypeBadge leadType={lead.leadType} />
          <ScoreBadge score={lead.intentScore} />
          {lead.urgencyScore != null && (
            <span className="rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-400 ring-1 ring-inset ring-orange-500/20">
              Urgency {lead.urgencyScore}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Section label="Location">
            <p className="text-sm text-gray-200">{lead.location || '—'}</p>
          </Section>
          <Section label="Budget">
            <p className="text-sm text-gray-200">{lead.budget || '—'}</p>
          </Section>
          <Section label="Source">
            <p className="text-sm text-gray-200">{lead.source || '—'}</p>
          </Section>
          <Section label="Manual Entry">
            <p className="text-sm text-gray-200">{lead.manual ? 'Yes' : 'Auto-discovered'}</p>
          </Section>
        </div>

        {lead.url && (
          <a href={lead.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:underline">
            Open source
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}

        {lead.snippet && (
          <Section label="Snippet / Content">
            <p className="whitespace-pre-wrap rounded-lg border border-gray-800 bg-gray-950/60 p-3 text-sm text-gray-300">{lead.snippet}</p>
          </Section>
        )}

        {(lead.detectedKeywords?.length > 0) && (
          <Section label="Detected Keywords">
            <div className="flex flex-wrap gap-1.5">
              {lead.detectedKeywords.map((kw) => (
                <span key={kw} className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300 ring-1 ring-inset ring-gray-700">{kw}</span>
              ))}
            </div>
          </Section>
        )}

        {(lead.scoreReasons?.length > 0) && (
          <Section label="Why This Score">
            <ul className="space-y-1 text-sm text-gray-400">
              {lead.scoreReasons.map((r, i) => <li key={i} className="flex gap-2"><span className="text-gray-600">•</span>{r}</li>)}
            </ul>
          </Section>
        )}

        <Section label="Suggested Outreach Message">
          <textarea
            rows={4}
            value={outreach}
            onChange={(e) => setOutreach(e.target.value)}
            onBlur={() => onUpdate(lead.id, { suggestedOutreach: outreach })}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 p-3 text-sm text-gray-200 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="mt-2 flex gap-2">
            <button onClick={handleCopy}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                copied ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30' : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-400 hover:to-cyan-400'
              }`}>
              {copied ? 'Copied!' : 'Copy Outreach'}
            </button>
            <button onClick={handleRegenerate}
              className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:bg-gray-700">
              Regenerate
            </button>
          </div>
        </Section>

        <Section label="Notes">
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => onUpdate(lead.id, { notes })}
            placeholder="Private notes to yourself"
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 p-3 text-sm text-gray-200 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Section>

        <Section label="Status">
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => onUpdate(lead.id, { status: s })}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                  lead.status === s
                    ? 'bg-blue-500/15 text-blue-300 ring-blue-500/40'
                    : 'text-gray-500 ring-gray-700 hover:text-gray-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </Section>

        <div className="flex justify-end border-t border-gray-800 pt-4">
          <button
            onClick={() => { onDelete(lead.id); onClose(); }}
            className="text-xs font-medium text-gray-600 transition hover:text-red-400"
          >
            Delete lead
          </button>
        </div>
      </div>
    </Modal>
  );
}
