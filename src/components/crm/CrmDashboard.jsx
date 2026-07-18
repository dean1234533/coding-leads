import { useState, useEffect, useMemo } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase';
import { groupFollowUps } from '../../utils/crmFollowUps';
import { STATUS_COLORS } from '../../utils/crmConstants';

function StatCard({ label, value, accent = 'text-gray-100', sub }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/80 backdrop-blur px-4 py-4 transition hover:border-gray-700">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 truncate">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${accent}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-600">{sub}</p>}
    </div>
  );
}

function formatDate(value) {
  if (!value) return '—';
  const d = value.toDate ? value.toDate() : new Date(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function LeadRow({ lead, onClick, trailing }) {
  const cfg = STATUS_COLORS[lead.status] ?? STATUS_COLORS['New'];
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-gray-800/40"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-200">{lead.businessName || 'Untitled lead'}</p>
        <p className="truncate text-xs text-gray-500">{lead.contactName || lead.email || '—'}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cfg.bg} ${cfg.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          {lead.status || 'New'}
        </span>
        {trailing}
      </div>
    </button>
  );
}

export default function CrmDashboard({ leads, onOpenLead, onGoToLeads, onGoToInbox }) {
  const [gmailStats, setGmailStats] = useState(null);
  const [statsError, setStatsError] = useState(null);

  useEffect(() => {
    const fn = httpsCallable(getFunctions(app), 'getGmailSentStats');
    fn().then(({ data }) => setGmailStats(data)).catch((err) => setStatsError(err?.message ?? 'Unavailable'));
  }, []);

  const followUps = useMemo(() => groupFollowUps(leads), [leads]);

  const counts = useMemo(() => {
    const openLeads = leads.filter((l) => !['Won', 'Lost', 'Archive'].includes(l.status)).length;
    const quotesSent = leads.filter((l) => l.status === 'Quote Sent').length;
    const won = leads.filter((l) => l.status === 'Won').length;
    const lost = leads.filter((l) => l.status === 'Lost').length;
    const replied = leads.filter((l) => l.status === 'Replied').length;
    return { openLeads, quotesSent, won, lost, replied };
  }, [leads]);

  // Pipeline/revenue — estimatedProjectValue is already captured per lead
  // (manual entry or the auto-scan's leadScore-derived estimate) but never
  // rolled up anywhere before this, so there was no way to see total
  // pipeline value or an actual win rate at a glance.
  const revenue = useMemo(() => {
    const value = (l) => (typeof l.estimatedProjectValue === 'number' ? l.estimatedProjectValue : 0);
    const openValue = leads.filter((l) => !['Won', 'Lost', 'Archive'].includes(l.status)).reduce((sum, l) => sum + value(l), 0);
    const wonLeads = leads.filter((l) => l.status === 'Won');
    const wonValue = wonLeads.reduce((sum, l) => sum + value(l), 0);
    const lostCount = leads.filter((l) => l.status === 'Lost').length;
    const decided = wonLeads.length + lostCount;
    const winRate = decided > 0 ? Math.round((wonLeads.length / decided) * 100) : null;
    return { openValue, wonValue, winRate };
  }, [leads]);

  const formatGbp = (n) => n >= 1000 ? `£${(n / 1000).toFixed(1)}k` : `£${n}`;

  const recentActivity = useMemo(() => {
    return [...leads]
      .filter((l) => l.updatedAt)
      .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
      .slice(0, 8);
  }, [leads]);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Today's Follow Ups" value={followUps.today.length} accent="text-amber-400" />
        <StatCard label="Emails Sent Today" value={gmailStats ? gmailStats.sentToday : statsError ? '—' : '…'} accent="text-blue-400" />
        <StatCard label="Emails Sent This Week" value={gmailStats ? gmailStats.sentThisWeek : statsError ? '—' : '…'} accent="text-cyan-400" />
        <StatCard label="Replies Received" value={counts.replied} accent="text-violet-400" />
        <StatCard label="Open Leads" value={counts.openLeads} />
        <StatCard label="Quotes Sent" value={counts.quotesSent} accent="text-purple-400" />
        <StatCard label="Clients Won" value={counts.won} accent="text-emerald-400" />
        <StatCard label="Clients Lost" value={counts.lost} accent="text-red-400" />
        <StatCard label="Late Follow Ups" value={followUps.late.length} accent={followUps.late.length ? 'text-red-400' : 'text-gray-100'} />
        <StatCard label="Follow Ups This Week" value={followUps.thisWeek.length} />
      </div>

      {/* Pipeline / revenue */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Open Pipeline Value" value={formatGbp(revenue.openValue)} accent="text-cyan-400" sub="Sum of estimated value across open leads" />
        <StatCard label="Won Revenue" value={formatGbp(revenue.wonValue)} accent="text-emerald-400" sub="Sum of estimated value across won leads" />
        <StatCard label="Win Rate" value={revenue.winRate === null ? '—' : `${revenue.winRate}%`} accent="text-purple-400" sub={revenue.winRate === null ? 'No decided leads yet' : 'Won ÷ (Won + Lost)'} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upcoming follow ups */}
        <section className="rounded-xl border border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 sm:px-6 sm:py-4">
            <h2 className="text-sm font-semibold text-gray-200">Upcoming Follow Ups</h2>
            <button onClick={onGoToLeads} className="text-xs text-blue-400 hover:text-blue-300">View all leads</button>
          </div>
          <div className="divide-y divide-gray-800/50 p-2">
            {[
              ['Late', followUps.late],
              ['Today', followUps.today],
              ['Tomorrow', followUps.tomorrow],
              ['This Week', followUps.thisWeek],
            ].map(([label, list]) => list.length > 0 && (
              <div key={label} className="py-2">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-600">{label} ({list.length})</p>
                {list.slice(0, 5).map((lead) => (
                  <LeadRow key={lead.id} lead={lead} onClick={() => onOpenLead(lead.id)} />
                ))}
              </div>
            ))}
            {followUps.late.length + followUps.today.length + followUps.tomorrow.length + followUps.thisWeek.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-gray-600">No follow-ups due — nice and clear.</p>
            )}
          </div>
        </section>

        {/* Recent activity */}
        <section className="rounded-xl border border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3 sm:px-6 sm:py-4">
            <h2 className="text-sm font-semibold text-gray-200">Recent Activity</h2>
            <button onClick={onGoToInbox} className="text-xs text-blue-400 hover:text-blue-300">Open inbox</button>
          </div>
          <div className="divide-y divide-gray-800/50 p-2">
            {recentActivity.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-gray-600">Nothing yet — add your first lead to get started.</p>
            )}
            {recentActivity.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                onClick={() => onOpenLead(lead.id)}
                trailing={<span className="text-xs text-gray-600">{formatDate(lead.updatedAt)}</span>}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
