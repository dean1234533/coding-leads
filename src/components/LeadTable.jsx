const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    dot:   'bg-amber-400',
    text:  'text-amber-400',
    bg:    'bg-amber-400/10 ring-amber-400/20',
  },
  draft_created: {
    label: 'Draft Created',
    dot:   'bg-emerald-400',
    text:  'text-emerald-400',
    bg:    'bg-emerald-400/10 ring-emerald-400/20',
  },
  error: {
    label: 'Error',
    dot:   'bg-red-400',
    text:  'text-red-400',
    bg:    'bg-red-400/10 ring-red-400/20',
  },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status ?? 'Unknown',
    dot:   'bg-gray-500',
    text:  'text-gray-400',
    bg:    'bg-gray-500/10 ring-gray-500/20',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} ${status === 'pending' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate?.() ?? new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function DeleteButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Delete lead"
      className="text-gray-600 hover:text-red-400 active:text-red-400 transition-colors"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
      </svg>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-600">
      <svg className="mb-4 h-10 w-10 opacity-30" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <p className="text-sm font-medium">No leads yet</p>
      <p className="mt-1 text-xs">Submit the form above to generate your first outreach draft.</p>
    </div>
  );
}

export default function LeadTable({ leads, onDelete }) {
  if (leads.length === 0) return <EmptyState />;

  return (
    <>
      {/* ── Mobile card list (hidden on md+) ── */}
      <div className="divide-y divide-gray-800/50 md:hidden">
        {leads.map((lead) => (
          <div key={lead.id} className="flex items-start justify-between gap-3 px-4 py-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="truncate font-medium text-gray-100">{lead.companyName}</p>
              {lead.websiteUrl && (
                <a href={lead.websiteUrl} target="_blank" rel="noopener noreferrer"
                  className="block truncate text-xs text-gray-600 hover:text-indigo-400 transition">
                  {lead.websiteUrl.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={lead.status} />
                <span className="text-xs text-gray-600">{formatDate(lead.createdAt)}</span>
                {lead.ownerName && (
                  <span className="text-xs text-gray-500">{lead.ownerName}</span>
                )}
              </div>
            </div>
            <DeleteButton onClick={() => onDelete(lead.id)} />
          </div>
        ))}
      </div>

      {/* ── Desktop table (hidden below md) ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-800 text-sm">
          <thead>
            <tr>
              {['Date', 'Company', 'Owner', 'Status', ''].map((label) => (
                <th key={label}
                  className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {leads.map((lead) => (
              <tr key={lead.id} className="group transition-colors hover:bg-gray-800/20">
                <td className="whitespace-nowrap px-5 py-4 tabular-nums text-gray-500">
                  {formatDate(lead.createdAt)}
                </td>
                <td className="px-5 py-4 font-medium text-gray-100">
                  <span className="block truncate max-w-[10rem]">{lead.companyName}</span>
                  {lead.websiteUrl && (
                    <a href={lead.websiteUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-0.5 block truncate max-w-[10rem] text-xs text-gray-600 hover:text-indigo-400 transition">
                      {lead.websiteUrl.replace(/^https?:\/\/(www\.)?/, '')}
                    </a>
                  )}
                </td>
                <td className="px-5 py-4 text-gray-300">
                  {lead.ownerName || <span className="text-gray-600">—</span>}
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="px-3 py-4 text-right">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <DeleteButton onClick={() => onDelete(lead.id)} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
