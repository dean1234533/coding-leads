import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { app, db } from '../../firebase';

const RADII = [
  { value: 1000, label: '1km' },
  { value: 2000, label: '2km' },
  { value: 5000, label: '5km' },
  { value: 10000, label: '10km' },
];

// Same opportunity ranking Business Scout uses — the scan already scores
// every result (no website / weak website via http or a free page-builder
// domain / has a real site) without needing a full audit up front, so it's
// shown right away instead of only after adding to the CRM.
function OpportunityBadge({ lead }) {
  if (lead.opportunityScore === 5) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
        No Website
      </span>
    );
  }
  if (lead.opportunityScore === 3) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-400 ring-1 ring-inset ring-orange-500/30">
        Weak Website
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-700/40 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 ring-1 ring-inset ring-gray-600/40">
      Has Website
    </span>
  );
}

// Searches Google Places for churches, places of worship, charities, charity shops, and community/
// voluntary organisations (scanMode: 'charity' on the backend, mirroring
// how 'agency' mode works) — kept as its own scan rather than folded into
// the regular Business Scout, since these are a genuinely different kind of
// outreach (free/discounted work, not a paid pitch) and get tracked
// separately from paying leads.
export default function CrmCharityScan() {
  const [location, setLocation] = useState('London, UK');
  const [radius, setRadius] = useState(5000);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [crmStatusById, setCrmStatusById] = useState({});

  async function scan() {
    if (!location.trim()) return;
    setLoading(true);
    setError(null);
    setLeads([]);
    try {
      const fn = httpsCallable(getFunctions(app), 'scanBusinessLeads', { timeout: 100000 });
      const { data } = await fn({ location, radius, scanMode: 'charity' });
      setLeads(data.leads ?? []);
    } catch (err) {
      console.error('[CrmCharityScan] scan failed:', err);
      setError(err?.message ?? 'Scan failed.');
    } finally {
      setLoading(false);
    }
  }

  async function auditLeadWebsite(website) {
    if (!website) return null;
    try {
      const fn = httpsCallable(getFunctions(app), 'auditWebsitesNow', { timeout: 130000 });
      const { data } = await fn({ urls: [website] });
      return data.results?.[website] ?? null;
    } catch (err) {
      console.warn('[CrmCharityScan] audit failed:', err);
      return null;
    }
  }

  async function addLeadToCrm(lead) {
    setCrmStatusById((s) => ({ ...s, [lead.id]: 'adding' }));
    try {
      if (lead.googleMapsUrl) {
        const dupeQuery = query(collection(db, 'crmLeads'), where('googleMapsUrl', '==', lead.googleMapsUrl));
        const dupeSnap = await getDocs(dupeQuery);
        if (!dupeSnap.empty) {
          setCrmStatusById((s) => ({ ...s, [lead.id]: 'duplicate' }));
          return;
        }
      }
      const audit = await auditLeadWebsite(lead.website);
      await addDoc(collection(db, 'crmLeads'), {
        businessName: lead.name ?? null,
        website: lead.website ?? null,
        email: lead.contactEmail ?? null,
        phone: lead.phone ?? null,
        contactName: lead.ownerName ?? null,
        instagramUrl: lead.instagramUrl ?? null,
        competitorName: lead.competitorName ?? null,
        competitorRating: lead.competitorRating ?? null,
        competitorReviewCount: lead.competitorReviewCount ?? null,
        industry: lead.industryLabel ?? 'Charity / Non-Profit',
        category: 'Charity',
        address: lead.address ?? null,
        googleMapsUrl: lead.googleMapsUrl ?? null,
        overallImpression: audit?.auditFailed
          ? `Auto-audit failed (${audit.error})`
          : audit?.overallImpression ?? (lead.hasWebsite ? null : 'No website found.'),
        websiteScore: audit?.websiteScore ?? null,
        issuesChecklist: audit?.issuesChecklist ?? [],
        speedNotes: audit?.speedNotes ?? null,
        mobileNotes: audit?.mobileNotes ?? null,
        seoNotes: audit?.seoNotes ?? null,
        aiDesignNote: audit?.aiDesignNote ?? null,
        status: 'New',
        priority: 'Medium',
        source: 'Charity Scan',
        tags: ['Charity'],
        dateAdded: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCrmStatusById((s) => ({ ...s, [lead.id]: 'added' }));
    } catch (err) {
      console.error('[CrmCharityScan] add to CRM failed:', err);
      setCrmStatusById((s) => ({ ...s, [lead.id]: 'error' }));
    }
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
      <h2 className="text-sm font-semibold text-gray-200">Charity Scan</h2>
      <p className="mt-1 text-xs text-gray-500">
        Searches for churches, places of worship, charities, charity shops, and community/voluntary organisations near a location — churches especially tend to have large, tight-knit congregations, so a good outcome there travels fast. A good pool for offering free or discounted website work in exchange for word-of-mouth referrals. Use the "Charity / Non-Profit Offer" template in your Template Library when reaching out — it's upfront about the free-work-for-a-recommendation arrangement.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && scan()}
          placeholder="e.g. Hackney, London"
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-full shrink-0 rounded-lg border border-gray-700 bg-gray-800/50 px-3.5 py-2.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none sm:w-32"
        >
          {RADII.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button
          onClick={scan}
          disabled={loading || !location.trim()}
          className="shrink-0 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Scanning…' : 'Scan'}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {leads.length > 0 && (
        <div className="mt-4 space-y-2">
          {leads.map((lead) => {
            const status = crmStatusById[lead.id];
            return (
              <div key={lead.id} className="rounded-lg border border-gray-800 bg-gray-800/40 p-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words text-sm font-semibold text-gray-100">{lead.name}</p>
                      <OpportunityBadge lead={lead} />
                      {lead.industryLabel && <span className="text-[10px] uppercase tracking-wider text-gray-600">{lead.industryLabel}</span>}
                    </div>
                    <p className="break-words text-xs text-gray-500">{lead.address}{lead.rating ? ` · ★ ${lead.rating} (${lead.reviewCount ?? 0})` : ''}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-gray-400">
                      {lead.website
                        ? <a href={lead.website} target="_blank" rel="noreferrer" className="break-all text-blue-400 hover:underline">{lead.website}</a>
                        : <span>No website found</span>}
                      <span className="break-all">{lead.contactEmail ? `· ${lead.contactEmail}` : '· No email found'}</span>
                    </p>
                    {lead.instagramUrl && (
                      <p className="mt-0.5 text-xs">
                        <a href={lead.instagramUrl} target="_blank" rel="noreferrer" className="text-pink-400 hover:underline">
                          {lead.instagramUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}
                        </a>
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => addLeadToCrm(lead)}
                    disabled={status === 'adding' || status === 'added' || status === 'duplicate'}
                    className="shrink-0 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {status === 'adding' ? 'Adding…' : status === 'added' ? 'Added' : status === 'duplicate' ? 'Already in CRM' : status === 'error' ? 'Failed — retry' : 'Add to CRM'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && leads.length === 0 && (
        <p className="mt-4 text-xs text-gray-600">No results yet — run a scan above.</p>
      )}
    </section>
  );
}
