import { STATUS_COLORS } from '../../utils/crmConstants';
import { isOverdue } from '../../utils/crmFollowUps';

function StatusBadge({ status }) {
  const cfg = STATUS_COLORS[status] ?? STATUS_COLORS['New'];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {status || 'New'}
    </span>
  );
}

function formatDate(value) {
  if (!value) return '—';
  const d = value.toDate ? value.toDate() : new Date(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-600">
      <svg className="mb-4 h-10 w-10 opacity-30" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-4-4" />
      </svg>
      <p className="text-sm font-medium">No leads match your filters</p>
      <p className="mt-1 text-xs">Try clearing filters or add a new lead.</p>
    </div>
  );
}

export default function CrmLeadsTable({ leads, onSelect, onDelete }) {
  if (leads.length === 0) return <EmptyState />;

  return (
    <>
      {/* Mobile cards */}
      <div className="divide-y divide-gray-800/50 md:hidden">
        {leads.map((lead) => (
          <div key={lead.id} className="flex items-start justify-between gap-3 px-4 py-4" onClick={() => onSelect(lead)}>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="truncate font-medium text-gray-100">{lead.businessName || 'Untitled lead'}</p>
              <p className="truncate text-xs text-gray-500">{lead.industry || '—'} · {lead.contactName || lead.email || '—'}</p>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={lead.status} />
                {lead.followUpDate && (
                  <span className={`text-xs ${isOverdue(lead.followUpDate) ? 'text-red-400' : 'text-gray-600'}`}>
                    Follow up {formatDate(lead.followUpDate)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-800 text-sm">
          <thead>
            <tr>
              {['Business', 'Industry', 'Contact', 'Status', 'Lead Score', 'Follow Up', 'Value', ''].map((label) => (
                <th key={label} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-gray-500 whitespace-nowrap">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {leads.map((lead) => (
              <tr key={lead.id} className="group cursor-pointer transition-colors hover:bg-gray-800/20" onClick={() => onSelect(lead)}>
                <td className="px-5 py-4 font-medium text-gray-100">
                  <span className="block truncate max-w-[12rem]">{lead.businessName || 'Untitled lead'}</span>
                  {lead.website && (
                    <span className="mt-0.5 block truncate max-w-[12rem] text-xs text-gray-600">
                      {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                    </span>
                  )}
                </td>
                <td className="px-5 py-4 text-gray-400 whitespace-nowrap">{lead.industry || '—'}</td>
                <td className="px-5 py-4 text-gray-300">
                  <span className="block truncate max-w-[10rem]">{lead.contactName || '—'}</span>
                  <span className="block truncate max-w-[10rem] text-xs text-gray-600">{lead.email || '—'}</span>
                </td>
                <td className="px-5 py-4"><StatusBadge status={lead.status} /></td>
                <td className="px-5 py-4 tabular-nums text-gray-300">{lead.leadScore ?? '—'}</td>
                <td className="px-5 py-4 whitespace-nowrap">
                  {lead.followUpDate ? (
                    <span className={isOverdue(lead.followUpDate) ? 'text-red-400 font-medium' : 'text-gray-400'}>
                      {formatDate(lead.followUpDate)}
                    </span>
                  ) : <span className="text-gray-600">—</span>}
                </td>
                <td className="px-5 py-4 tabular-nums text-gray-400 whitespace-nowrap">
                  {lead.estimatedProjectValue ? `£${Number(lead.estimatedProjectValue).toLocaleString()}` : '—'}
                </td>
                <td className="px-3 py-4 text-right">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(lead.id); }}
                    aria-label="Delete lead"
                    className="opacity-0 text-gray-600 hover:text-red-400 transition group-hover:opacity-100"
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
