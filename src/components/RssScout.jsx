/**
 * BusinessScout
 *
 * Searches Google Places for real local businesses and surfaces the ones
 * that are most likely to need a website or mobile app built. A business
 * with no website at all is flagged as a "Prime Lead". Results are sorted
 * highest-opportunity first.
 *
 * Props:
 *   onCopyToForm({ companyName, websiteUrl, ownerName }) — called when the
 *   user clicks "Copy to Outreach Form". Parent updates its form state.
 */

import { useState, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

// ─── Business type options (mirrors the backend BUSINESS_TYPES list) ──────────
const BUSINESS_TYPES = [
  { value: 'restaurant',         label: 'Restaurants & Cafés'  },
  { value: 'beauty_salon',       label: 'Beauty & Hair Salons' },
  { value: 'gym',                label: 'Gyms & Fitness'       },
  { value: 'lawyer',             label: 'Law Firms'            },
  { value: 'real_estate_agency', label: 'Estate Agents'        },
  { value: 'accounting',         label: 'Accountants'          },
  { value: 'plumber',            label: 'Tradespeople'         },
  { value: 'clothing_store',     label: 'Retail / Clothing'    },
  { value: 'car_repair',         label: 'Auto Services'        },
  { value: 'dentist',            label: 'Dentists & Medical'   },
  { value: 'store',              label: 'General Retail'       },
];

const RADII = [
  { value: 500,  label: '500m'  },
  { value: 1000, label: '1km'   },
  { value: 2000, label: '2km'   },
  { value: 5000, label: '5km'   },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function PrimeBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd"/>
      </svg>
      No Website
    </span>
  );
}

function HasWebBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400 ring-1 ring-inset ring-amber-500/30">
      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM6.75 9.25a.75.75 0 000 1.5h4.59l-2.1 1.95a.75.75 0 001.02 1.1l3.5-3.25a.75.75 0 000-1.1l-3.5-3.25a.75.75 0 10-1.02 1.1l2.1 1.95H6.75z" clipRule="evenodd"/>
      </svg>
      App Opportunity
    </span>
  );
}

function StarRating({ rating, count }) {
  if (!rating) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-gray-500">
      <svg className="h-3 w-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
      </svg>
      {rating.toFixed(1)} ({count ?? 0})
    </span>
  );
}

function LeadCard({ lead, onCopy, isCopied }) {
  const isPrime = lead.opportunityScore >= 5;

  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-4 transition ${
      isPrime
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-gray-800 bg-gray-900/60 hover:border-gray-700'
    }`}>

      {/* Badges + name */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {isPrime ? <PrimeBadge /> : <HasWebBadge />}
          <StarRating rating={lead.rating} count={lead.reviewCount} />
        </div>
        <h3 className="font-semibold text-gray-100">{lead.name}</h3>
        {lead.address && (
          <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{lead.address}</p>
        )}
      </div>

      {/* Owner name row */}
      {lead.ownerName ? (
        <div className="flex items-center gap-1.5 text-xs">
          <svg className="h-3 w-3 flex-shrink-0 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
          <span className="font-medium text-indigo-300">{lead.ownerName}</span>
          <span className="text-gray-600">— owner</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <svg className="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
          <span className="italic">Owner name not found — verify manually</span>
        </div>
      )}

      {/* Website / phone row */}
      <div className="flex flex-wrap gap-3 text-xs">
        {lead.website ? (
          <a
            href={lead.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-indigo-400 hover:underline"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
            {new URL(lead.website).hostname.replace(/^www\./, '')}
          </a>
        ) : (
          <span className="text-gray-600 italic">No website found</span>
        )}

        {lead.phone && (
          <a href={`tel:${lead.phone}`}
            className="flex items-center gap-1 text-gray-400 hover:text-gray-200">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
            </svg>
            {lead.phone}
          </a>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => onCopy(lead)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
            isCopied
              ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
              : 'bg-indigo-600 text-white hover:bg-indigo-500'
          }`}
        >
          {isCopied ? (
            <>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
              </svg>
              Copied to Form
            </>
          ) : 'Copy to Outreach Form'}
        </button>

        {lead.googleMapsUrl && (
          <a
            href={lead.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-600 transition hover:text-gray-400"
          >
            View on Maps →
          </a>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <div className="flex gap-2">
        <div className="h-5 w-24 rounded-full bg-gray-800"/>
        <div className="h-5 w-16 rounded-full bg-gray-800"/>
      </div>
      <div className="h-4 w-2/3 rounded bg-gray-800"/>
      <div className="h-3 w-1/2 rounded bg-gray-800"/>
      <div className="h-3 w-1/3 rounded bg-gray-800"/>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RssScout({ onCopyToForm }) {
  const [location, setLocation]   = useState('London, UK');
  const [type,     setType]       = useState('restaurant');
  const [radius,   setRadius]     = useState(2000);
  const [leads,    setLeads]      = useState([]);
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState(null);
  const [meta,     setMeta]       = useState(null);
  const [copiedId, setCopiedId]   = useState(null);
  const [filter,   setFilter]     = useState('all'); // 'all' | 'prime'

  const scan = useCallback(async () => {
    if (!location.trim()) return;
    setLoading(true);
    setError(null);
    setLeads([]);
    setMeta(null);
    try {
      const fns = getFunctions(app);
      const res = await httpsCallable(fns, 'scanBusinessLeads')({ location, type, radius });
      setLeads(res.data.leads ?? []);
      setMeta(res.data.meta);
    } catch (err) {
      console.error('[BusinessScout]', err);
      setError(err?.message ?? 'Scan failed. Check your Google Places API key is set.');
    } finally {
      setLoading(false);
    }
  }, [location, type, radius]);

  function handleCopy(lead) {
    onCopyToForm({
      companyName: lead.name,
      websiteUrl:  lead.website ?? '',
      ownerName:   lead.ownerName ?? '',
    });
    setCopiedId(lead.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const primeCount = leads.filter(l => l.opportunityScore >= 5).length;
  const visible    = filter === 'prime'
    ? leads.filter(l => l.opportunityScore >= 5)
    : leads;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Business Lead Scout</h1>
        <p className="text-xs text-gray-500">
          Find local businesses that need a website or mobile app — sorted by opportunity.
        </p>
      </div>

      {/* Search controls */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">

        {/* Location */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Location</label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && scan()}
            placeholder="e.g. Hackney, London"
            className="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Type + Radius row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Business Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-3 text-sm text-gray-100 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              {BUSINESS_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Radius</label>
            <select
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-3 text-sm text-gray-100 outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              {RADII.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Scan button */}
        <button
          onClick={scan}
          disabled={loading || !location.trim()}
          className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Scanning businesses…
            </span>
          ) : 'Scan for Leads'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
          </svg>
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i}/>)}
        </div>
      )}

      {/* Results */}
      {!loading && leads.length > 0 && (
        <>
          {/* Summary + filter */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-200">
                {leads.length} businesses found
                {meta?.location && <span className="font-normal text-gray-500"> near {meta.location}</span>}
              </p>
              {primeCount > 0 && (
                <p className="text-xs text-emerald-400">
                  {primeCount} with no website — highest priority leads
                </p>
              )}
            </div>
            <div className="flex gap-1 rounded-xl border border-gray-800 bg-gray-900 p-1">
              {[
                { key: 'all',   label: `All (${leads.length})`   },
                { key: 'prime', label: `No Website (${primeCount})` },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    filter === key ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {visible.map(lead => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onCopy={handleCopy}
                isCopied={copiedId === lead.id}
              />
            ))}
          </div>
        </>
      )}

      {/* Empty state after scan */}
      {!loading && !error && meta && leads.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">No businesses found in that area.</p>
          <p className="mt-1 text-xs text-gray-600">Try a different location or business type.</p>
        </div>
      )}

      {/* Pre-scan prompt */}
      {!loading && !error && !meta && (
        <div className="rounded-xl border border-dashed border-gray-800 py-12 text-center">
          <svg className="mx-auto mb-3 h-8 w-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <p className="text-sm text-gray-500">Enter a location and hit Scan to find leads.</p>
          <p className="mt-1 text-xs text-gray-600">
            Businesses with no website are flagged as prime leads.
          </p>
        </div>
      )}
    </div>
  );
}
