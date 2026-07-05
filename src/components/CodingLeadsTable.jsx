const STATUS_CONFIG = {
  'New':          { dot: 'bg-sky-400',     text: 'text-sky-400',     bg: 'bg-sky-400/10 ring-sky-400/20' },
  'Saved':        { dot: 'bg-violet-400',  text: 'text-violet-400',  bg: 'bg-violet-400/10 ring-violet-400/20' },
  'Contacted':    { dot: 'bg-blue-400',    text: 'text-blue-400',    bg: 'bg-blue-400/10 ring-blue-400/20' },
  'Replied':      { dot: 'bg-cyan-400',    text: 'text-cyan-400',    bg: 'bg-cyan-400/10 ring-cyan-400/20' },
  'Follow Up':    { dot: 'bg-amber-400',   text: 'text-amber-400',   bg: 'bg-amber-400/10 ring-amber-400/20' },
  'Won':          { dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-400/10 ring-emerald-400/20' },
  'Lost':         { dot: 'bg-red-400',     text: 'text-red-400',     bg: 'bg-red-400/10 ring-red-400/20' },
  'Not Relevant': { dot: 'bg-gray-500',    text: 'text-gray-400',    bg: 'bg-gray-500/10 ring-gray-500/20' },
};

export function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG['New'];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {status}
    </span>
  );
}

export function LeadTypeBadge({ leadType }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-300 ring-1 ring-inset ring-gray-700">
      {leadType || 'Other'}
    </span>
  );
}

export function ScoreBadge({ score }) {
  const s = score ?? 0;
  const cfg = s >= 70
    ? { text: 'text-emerald-400', bg: 'bg-emerald-400/10 ring-emerald-400/20' }
    : s >= 40
      ? { text: 'text-amber-400', bg: 'bg-amber-400/10 ring-amber-400/20' }
      : { text: 'text-gray-400', bg: 'bg-gray-500/10 ring-gray-500/20' };
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${cfg.bg} ${cfg.text}`}>
      {s}
    </span>
  );
}

function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate?.() ?? new Date(timestamp);
  return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: '2-digit' });
}

function EmptyState({ hasLeads }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-600">
      <svg className="mb-4 h-10 w-10 opacity-30" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <p className="text-sm font-medium">{hasLeads ? 'No leads match these filters' : 'No coding leads yet'}</p>
      <p className="mt-1 text-xs">
        {hasLeads ? 'Try widening your filters or search.' : 'Add one manually or click "Scan Now" to pull from RSS sources.'}
      </p>
    </div>
  );
}

export default function CodingLeadsTable({ leads, totalCount, onSelect, onDelete, onStatusChange }) {
  if (leads.length === 0) return <EmptyState hasLeads={totalCount > 0} />;

  return (
    <>
      {/* Mobile cards */}
      <div className="divide-y divide-gray-800/50 md:hidden">
        {leads.map((lead) => (
          <button
            key={lead.id}
            onClick={() => onSelect(lead)}
            className="flex w-full flex-col gap-2 px-4 py-4 text-left transition hover:bg-gray-800/20"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 truncate font-medium text-gray-100">{lead.title}</p>
              <ScoreBadge score={lead.intentScore} />
            </div>
            <p className="line-clamp-2 text-xs text-gray-500">{lead.snippet}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={lead.status} />
              <LeadTypeBadge leadType={lead.leadType} />
              <span className="text-xs text-gray-600">{lead.source}</span>
              <span className="text-xs text-gray-600">· {formatDate(lead.createdAt)}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-800 text-sm">
          <thead>
            <tr>
              {['Lead', 'Type', 'Source', 'Score', 'Status', 'Found', ''].map((label) => (
                <th key={label} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {leads.map((lead) => (
              <tr key={lead.id} className="group cursor-pointer transition-colors hover:bg-gray-800/20" onClick={() => onSelect(lead)}>
                <td className="max-w-xs px-5 py-4">
                  <p className="truncate font-medium text-gray-100">{lead.title}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-600">{lead.snippet}</p>
                </td>
                <td className="px-5 py-4"><LeadTypeBadge leadType={lead.leadType} /></td>
                <td className="whitespace-nowrap px-5 py-4 text-gray-400">{lead.source}</td>
                <td className="px-5 py-4"><ScoreBadge score={lead.intentScore} /></td>
                <td className="px-5 py-4">
                  <select
                    value={lead.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onStatusChange(lead.id, e.target.value)}
                    className="rounded-lg border border-gray-700 bg-gray-800/50 px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {Object.keys(STATUS_CONFIG).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="whitespace-nowrap px-5 py-4 tabular-nums text-gray-500">{formatDate(lead.createdAt)}</td>
                <td className="px-3 py-4 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(lead.id); }}
                    aria-label="Delete lead"
                    className="opacity-0 text-gray-600 transition hover:text-red-400 group-hover:opacity-100"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export { STATUS_CONFIG };
