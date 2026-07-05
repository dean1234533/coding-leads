import { computeAnalytics } from '../utils/codingLeadsAnalytics';

export default function CodingLeadsAnalytics({ leads }) {
  const a = computeAnalytics(leads);

  const cards = [
    { label: 'Total Leads',      value: a.total },
    { label: 'New',              value: a.newLeads },
    { label: 'High Intent',      value: a.highIntent },
    { label: 'Contacted',        value: a.contacted },
    { label: 'Replies',          value: a.replies },
    { label: 'Won',              value: a.won },
    { label: 'Website Leads',    value: a.websiteLeads },
    { label: 'App Leads',        value: a.appLeads },
    { label: 'MVP / SaaS Leads', value: a.saasMvpLeads },
    { label: 'Best Source',      value: a.bestSource,  isText: true },
    { label: 'Best Keyword',     value: a.bestKeyword, isText: true },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map(({ label, value, isText }) => (
        <div key={label} className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-3 sm:px-4">
          <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-gray-500">{label}</p>
          <p className={`mt-1 font-semibold text-gray-100 ${isText ? 'truncate text-sm' : 'text-2xl tabular-nums'}`}>
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}
