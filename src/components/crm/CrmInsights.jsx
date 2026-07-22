import { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../../firebase';

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

export default function CrmInsights() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable(getFunctions(app), 'getBusinessInsights', { timeout: 60000 });
      const { data } = await fn({ forceRefresh });
      setInsights(data);
    } catch (err) {
      setError(err?.message ?? 'Failed to load insights.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  if (loading && !insights) {
    return <p className="text-sm text-gray-500">Loading insights…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">Business Insights</h2>
          <p className="mt-1 text-xs text-gray-500">
            Cached for an hour so this doesn't re-scan everything on every visit.
            {insights?.computedAt && (
              <> Last updated {insights.computedAt?.toDate ? insights.computedAt.toDate().toLocaleString('en-GB') : 'just now'}.</>
            )}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="rounded-lg bg-gray-800 px-3.5 py-2 text-xs font-semibold text-gray-200 transition hover:bg-gray-700 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh Now'}
        </button>
      </div>

      {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">{error}</p>}

      {insights && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Leads (30d)" value={insights.leadsGenerated30d} sub={`+${insights.codingLeadsGenerated30d} coding leads`} />
            <StatCard label="Conversion Rate" value={insights.conversionRate !== null ? `${insights.conversionRate}%` : '—'} sub={`${insights.wonCount} won / ${insights.lostCount} lost`} />
            <StatCard label="Won Revenue" value={`£${insights.revenue.toLocaleString('en-GB')}`} />
            <StatCard label="Open Pipeline" value={`£${insights.openPipelineValue.toLocaleString('en-GB')}`} />
            <StatCard label="Total CRM Leads" value={insights.totalCrmLeads} />
            <StatCard label="Stale Won Clients" value={insights.staleWonClients} sub="Not recontacted in 90+ days" />
          </div>

          {insights.recommendations?.length > 0 && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">AI Recommendations</p>
              <ul className="mt-2 space-y-1.5 text-sm text-gray-300">
                {insights.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-2"><span className="text-blue-500">•</span>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {insights.bestSources?.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Best Sources</p>
              <div className="mt-2 space-y-1.5">
                {insights.bestSources.map((s) => (
                  <div key={s.source} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{s.source}</span>
                    <span className="text-gray-500">{s.total} lead{s.total === 1 ? '' : 's'}{s.winRate !== null ? ` · ${s.winRate}% win rate` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {insights.issueAnalytics?.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Marketing Performance — Reply Rate by Issue</p>
              <div className="mt-2 space-y-1.5">
                {insights.issueAnalytics.slice(0, 8).map((i) => (
                  <div key={i.issue} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{i.issue}</span>
                    <span className="text-gray-500">{i.replyRate}% ({i.repliedCount}/{i.sentCount})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-600">
            Appointment/booking statistics aren't tracked yet — the booking calendar creates a Google Calendar event but nothing is saved to the CRM to report on.
          </p>
        </>
      )}
    </div>
  );
}
