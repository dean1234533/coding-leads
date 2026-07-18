/**
 * BusinessScout
 *
 * Searches Google Places for real local businesses and surfaces the ones
 * that are most likely to need a website or mobile app built. A business
 * with no website at all is flagged as a "Prime Lead". Results are sorted
 * highest-opportunity first. Results can be added straight into the
 * Outreach CRM's lead database, individually or all at once.
 */

import { useState, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { app, db } from '../firebase';

// ─── Scan modes ───────────────────────────────────────────────────────────────
const SCAN_MODES = [
  { value: 'business', label: 'Local Business' },
  { value: 'agency',   label: 'Digital Agency' },
];

// ─── Business type options (mirrors the backend BUSINESS_TYPES list) ──────────
const BUSINESS_TYPES = [
  { value: 'restaurant',         label: 'Restaurants & Cafés'      },
  { value: 'bakery',             label: 'Bakeries'                 },
  { value: 'bar',                label: 'Bars & Pubs'              },
  { value: 'beauty_salon',       label: 'Beauty & Hair Salons'     },
  { value: 'barber',             label: 'Barbers'                  },
  { value: 'nail_salon',         label: 'Nail Salons'              },
  { value: 'spa',                label: 'Spas & Massage'           },
  { value: 'gym',                label: 'Gyms & Fitness'           },
  { value: 'personal_trainer',   label: 'Personal Trainers'        },
  { value: 'yoga_studio',        label: 'Yoga Studios'             },
  { value: 'physiotherapist',    label: 'Physiotherapists'         },
  { value: 'chiropractor',       label: 'Chiropractors'            },
  { value: 'dentist',            label: 'Dentists & Medical'       },
  { value: 'optician',           label: 'Opticians'                },
  { value: 'veterinary_care',    label: 'Veterinary Clinics'       },
  { value: 'lawyer',             label: 'Law Firms'                },
  { value: 'accounting',         label: 'Accountants'              },
  { value: 'real_estate_agency', label: 'Estate Agents'            },
  { value: 'insurance_agency',   label: 'Insurance Agents'         },
  { value: 'financial_advisor',  label: 'Financial Advisors'       },
  { value: 'plumber',            label: 'Plumbers'                 },
  { value: 'electrician',        label: 'Electricians'             },
  { value: 'builder',            label: 'Builders'                 },
  { value: 'roofer',             label: 'Roofers'                  },
  { value: 'painter_decorator',  label: 'Painters & Decorators'    },
  { value: 'locksmith',          label: 'Locksmiths'               },
  { value: 'cleaner',            label: 'Cleaning Services'        },
  { value: 'gardener',           label: 'Gardeners & Landscapers'  },
  { value: 'clothing_store',     label: 'Retail / Clothing'        },
  { value: 'jewelry_store',      label: 'Jewellers'                },
  { value: 'florist',            label: 'Florists'                 },
  { value: 'furniture_store',    label: 'Furniture Stores'         },
  { value: 'pet_store',          label: 'Pet Stores'               },
  { value: 'store',              label: 'General Retail'           },
  { value: 'car_repair',         label: 'Auto Repair Garages'      },
  { value: 'car_dealer',         label: 'Car Dealers'              },
  { value: 'car_wash',           label: 'Car Washes & Valeting'    },
  { value: 'photographer',       label: 'Wedding Photographers'    },
  { value: 'event_planner',      label: 'Event Planners'           },
  { value: 'dj',                 label: 'DJs & Entertainers'       },
  { value: 'tutor',              label: 'Tutors'                   },
  { value: 'driving_school',     label: 'Driving Instructors'      },
  { value: 'nursery',            label: 'Nurseries & Childcare'    },
  { value: 'moving_company',     label: 'Removal Companies'        },
  { value: 'travel_agency',      label: 'Travel Agents'            },
  { value: 'funeral_home',       label: 'Funeral Directors'        },
];

const RADII = [
  { value: 500,  label: '500m'  },
  { value: 1000, label: '1km'   },
  { value: 2000, label: '2km'   },
  { value: 5000, label: '5km'   },
];

// ─── Design / app prompt generator ───────────────────────────────────────────

const TYPE_LABELS = {
  restaurant:          'restaurant or café',
  beauty_salon:        'beauty salon or hair salon',
  gym:                 'gym or fitness studio',
  lawyer:              'law firm',
  real_estate_agency:  'estate agency',
  accounting:          'accountancy firm',
  plumber:             'trades business',
  clothing_store:      'clothing or retail shop',
  car_repair:          'auto repair garage',
  dentist:             'dental or medical practice',
  store:               'retail shop',
};

const TYPE_COLOURS = {
  restaurant:          'warm earthy tones — terracotta, cream, and deep green',
  beauty_salon:        'soft luxury palette — blush pink, champagne, and charcoal',
  gym:                 'bold, energetic palette — black, electric blue, and white',
  lawyer:              'professional palette — navy, gold, and white',
  real_estate_agency:  'trustworthy palette — dark navy, white, and gold accents',
  accounting:          'clean corporate palette — slate blue, white, and grey',
  plumber:             'bold, trustworthy palette — deep blue, white, and orange',
  clothing_store:      'modern retail palette — black, white, and a bold accent colour',
  car_repair:          'industrial palette — charcoal, red, and white',
  dentist:             'clean clinical palette — white, soft blue, and mint green',
  store:               'clean modern palette — white, grey, and a bold accent',
};

function generateFigmaPrompt(lead, businessType) {
  const typeLabel  = TYPE_LABELS[businessType]  ?? 'local business';
  const colours    = TYPE_COLOURS[businessType] ?? 'clean modern palette — white, grey, and a bold accent';
  const city       = lead.address?.split(',').slice(-2).join(',').trim() ?? 'the local area';
  const name       = lead.name;

  if (!lead.website) {
    return `Design a modern, professional website homepage for "${name}", a ${typeLabel} based in ${city}. They currently have no website so this needs to make a strong first impression and convert visitors into customers.

Include:
- A bold hero section with business name, a one-line value proposition, and a clear call-to-action button (e.g. "Book Now" or "Get a Quote")
- A services / menu / offerings section with icons or cards
- A customer reviews / testimonials section
- A contact section with phone number, address, and a simple enquiry form
- A sticky mobile navigation bar at the bottom

Style: mobile-first, clean and modern, ${colours}. Target audience: local customers searching on their phone.`;
  }

  if (lead.opportunityScore === 3) {
    return `Redesign the homepage for "${name}", a ${typeLabel} in ${city}. Their current website looks outdated — create a fresh, modern redesign that looks credible and drives enquiries.

Include:
- A bold, full-width hero section with a strong headline and CTA button
- A services section with clean cards or grid layout
- Trust signals — customer reviews, years in business, or certifications
- A clear contact / booking section
- Smooth mobile layout with large tap targets

Style: ${colours}. The redesign should feel instantly more professional than their current site.`;
  }

  // Has website → Base44 app prompt
  return null; // signals to use generateBase44Prompt instead
}

function generateBase44Prompt(lead, businessType) {
  const typeLabel = TYPE_LABELS[businessType] ?? 'local business';
  const city      = lead.address?.split(',').slice(-2).join(',').trim() ?? 'the local area';
  const name      = lead.name;

  return `Build a mobile app for "${name}", a ${typeLabel} based in ${city}.

The app should complement their existing website (${lead.website ?? 'they have a website'}) and give customers a reason to download and keep using it.

Core features to build:
1. **Home screen** — welcome banner with business name, quick-access buttons for booking, menu/services, and offers
2. **Booking / appointment flow** — pick a service, pick a date and time, confirm booking (send confirmation notification)
3. **Loyalty stamp card** — customers earn a stamp per visit, reward unlocks after 10 stamps
4. **Push notifications** — send offers and reminders to customers who have the app
5. **Contact & info screen** — opening hours, address with map, phone number, social links

Authentication: simple email/phone login for customers.

Keep the UI clean and easy to use on mobile. The business owner should be able to manage bookings and send notifications from a simple admin panel.`;
}

export function getPromptType(lead) {
  if (lead.opportunityScore === 1) return 'base44';
  return 'figma';
}

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

function WeakWebBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-400 ring-1 ring-inset ring-orange-500/30">
      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
      </svg>
      Weak Website
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

function LeadCard({ lead, onFigmaCopy, isFigmaCopied, businessType, onAddToCrm, crmStatus }) {
  const score   = lead.opportunityScore;
  const isPrime = score >= 5;
  const isWeak  = score === 3;

  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-4 transition ${
      isPrime ? 'border-emerald-500/30 bg-emerald-500/5'
      : isWeak ? 'border-orange-500/20 bg-orange-500/5'
      : 'border-gray-800 bg-gray-900/60 hover:border-gray-700'
    }`}>

      {/* Badges + name */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {isPrime ? <PrimeBadge /> : isWeak ? <WeakWebBadge /> : <HasWebBadge />}
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
          <svg className="h-3 w-3 flex-shrink-0 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
          <span className="font-medium text-blue-300">{lead.ownerName}</span>
          {lead.ownerNameSource && (
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
              lead.ownerNameSource === 'business name'
                ? 'bg-violet-500/15 text-violet-400'
                : lead.ownerNameSource === 'website'
                  ? 'bg-gray-700 text-gray-400'
                  : 'bg-emerald-500/10 text-emerald-500'
            }`}>
              {lead.ownerNameSource}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <svg className="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
          <span className="italic">Owner name not found</span>
        </div>
      )}

      {/* Website / phone / email row */}
      <div className="flex flex-wrap gap-3 text-xs">
        {lead.website ? (
          <a
            href={lead.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-400 hover:underline"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
            {(() => { try { return new URL(lead.website).hostname.replace(/^www\./, ''); } catch { return lead.website; } })()}
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

      {/* Contact email row */}
      {lead.contactEmail ? (
        <div className="flex items-center gap-1.5 text-xs">
          <svg className="h-3 w-3 flex-shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <a href={`mailto:${lead.contactEmail}`} className="text-emerald-400 hover:underline font-mono">
            {lead.contactEmail}
          </a>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <svg className="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <span className="italic">No email found</span>
        </div>
      )}

      {/* Instagram row — only looked up when there's no email to fall back on */}
      {lead.instagramUrl && (
        <div className="flex items-center gap-1.5 text-xs">
          <svg className="h-3 w-3 flex-shrink-0 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="5" strokeWidth={2} />
            <circle cx="12" cy="12" r="4" strokeWidth={2} />
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          <a href={lead.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:underline">
            {lead.instagramUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}
          </a>
        </div>
      )}

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={() => onAddToCrm(lead)}
          disabled={crmStatus === 'added' || crmStatus === 'duplicate' || crmStatus === 'adding'}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:cursor-default ${
            crmStatus === 'added' || crmStatus === 'duplicate'
              ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
              : 'bg-teal-600 text-white hover:bg-teal-500'
          }`}
        >
          {crmStatus === 'adding' ? (
            'Auditing site…'
          ) : crmStatus === 'added' ? (
            <>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
              </svg>
              Added to CRM
            </>
          ) : crmStatus === 'duplicate' ? (
            'Already in CRM'
          ) : 'Add to CRM'}
        </button>

        <button
          onClick={() => onFigmaCopy(lead)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
            isFigmaCopied
              ? 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {isFigmaCopied ? (
            <>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
              </svg>
              Prompt Copied
            </>
          ) : (
            <>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              {lead.opportunityScore === 1 ? 'Base44 Prompt' : 'Figma Prompt'}
            </>
          )}
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

export default function RssScout() {
  const [scanMode, setScanMode]   = useState('business');
  const [location, setLocation]   = useState('London, UK');
  const [types,    setTypes]      = useState(['restaurant']);
  const [radius,   setRadius]     = useState(2000);
  const [leads,    setLeads]      = useState([]);
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState(null);
  const [meta,     setMeta]       = useState(null);
  const [figmaCopiedId, setFigmaCopiedId] = useState(null);
  const [filter,        setFilter]        = useState('all');
  const [crmStatusById, setCrmStatusById] = useState({}); // leadId -> 'adding' | 'added' | 'duplicate' | 'error'
  const [addingAll,     setAddingAll]     = useState(false);
  const [addAllSummary, setAddAllSummary] = useState(null);

  function handleScanModeChange(mode) {
    setScanMode(mode);
    setLeads([]);
    setMeta(null);
    setError(null);
  }

  function toggleType(value) {
    setTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  const scan = useCallback(async () => {
    if (!location.trim()) return;
    if (scanMode === 'business' && types.length === 0) { setError('Pick at least one business type.'); return; }
    setLoading(true);
    setError(null);
    setLeads([]);
    setMeta(null);
    try {
      const fns = getFunctions(app);
      const res = await httpsCallable(fns, 'scanBusinessLeads', { timeout: 100000 })({ location, types, radius, scanMode });
      setLeads(res.data.leads ?? []);
      setMeta(res.data.meta);
    } catch (err) {
      console.error('[BusinessScout]', err);
      setError(err?.message ?? 'Scan failed. Check your Google Places API key is set.');
    } finally {
      setLoading(false);
    }
  }, [location, types, radius, scanMode]);

  function handleFigmaCopy(lead) {
    // A multi-type scan mixes leads from several categories — use the
    // specific one that actually matched this lead, not just whichever was
    // selected first, so the mockup prompt fits the right kind of business.
    const leadType = BUSINESS_TYPES.find((t) => t.label === lead.industryLabel)?.value ?? types[0] ?? 'restaurant';
    const figmaPrompt = generateFigmaPrompt(lead, leadType);
    const prompt = figmaPrompt ?? generateBase44Prompt(lead, leadType);
    navigator.clipboard.writeText(prompt).catch(() => {});
    setFigmaCopiedId(lead.id);
    setTimeout(() => setFigmaCopiedId(null), 2000);
  }

  // Runs a real PageSpeed audit against the lead's website before it's saved,
  // so it arrives in the CRM with issuesChecklist/websiteScore/notes already
  // filled in instead of needing a manual Website Review pass. Best-effort —
  // a failed/slow audit shouldn't block adding the lead at all.
  async function auditLeadWebsite(website) {
    if (!website) return null;
    try {
      const fn = httpsCallable(getFunctions(app), 'auditWebsitesNow', { timeout: 90000 });
      const { data } = await fn({ urls: [website] });
      return data.results?.[website] ?? null;
    } catch (err) {
      console.warn('[BusinessScout] Website audit failed:', err);
      return null;
    }
  }

  // ── Add to Outreach CRM ─────────────────────────────────────────────────
  // Writes straight into crmLeads (client-direct, same pattern as CrmLeadAddForm)
  // so scanned businesses show up in the CRM without going through the old
  // manual-draft form / legacy `leads` collection.
  async function addLeadToCrm(lead) {
    setCrmStatusById((s) => ({ ...s, [lead.id]: 'adding' }));
    try {
      if (lead.googleMapsUrl) {
        const dupeQuery = query(collection(db, 'crmLeads'), where('googleMapsUrl', '==', lead.googleMapsUrl));
        const dupeSnap = await getDocs(dupeQuery);
        if (!dupeSnap.empty) {
          setCrmStatusById((s) => ({ ...s, [lead.id]: 'duplicate' }));
          return 'duplicate';
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
        industry: lead.industryLabel ?? BUSINESS_TYPES.find((t) => types.includes(t.value))?.label ?? null,
        address: lead.address ?? null,
        googleMapsUrl: lead.googleMapsUrl ?? null,
        overallImpression: audit?.auditFailed
          ? `Auto-audit failed (${audit.error}) — ${lead.opportunityLabel ?? 'try a manual Website Review instead.'}`
          : audit?.overallImpression ?? lead.opportunityLabel ?? null,
        websiteScore: audit?.websiteScore ?? null,
        issuesChecklist: audit?.issuesChecklist ?? [],
        speedNotes: audit?.speedNotes ?? null,
        mobileNotes: audit?.mobileNotes ?? null,
        seoNotes: audit?.seoNotes ?? null,
        aiDesignNote: audit?.aiDesignNote ?? null,
        status: 'New',
        priority: 'Medium',
        source: 'Google Maps',
        leadScore: typeof lead.opportunityScore === 'number' ? lead.opportunityScore * 20 : null,
        tags: [],
        dateAdded: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCrmStatusById((s) => ({ ...s, [lead.id]: 'added' }));
      return 'added';
    } catch (err) {
      console.error('[BusinessScout] Add to CRM failed:', err);
      setCrmStatusById((s) => ({ ...s, [lead.id]: 'error' }));
      return 'error';
    }
  }

  async function handleAddAllToCrm() {
    setAddingAll(true);
    setAddAllSummary(null);
    let added = 0;
    let skipped = 0;
    for (const lead of visible) {
      const existing = crmStatusById[lead.id];
      if (existing === 'added' || existing === 'duplicate') { skipped += 1; continue; }
      const result = await addLeadToCrm(lead);
      if (result === 'added') added += 1;
      else skipped += 1;
    }
    setAddingAll(false);
    setAddAllSummary({ added, skipped });
  }

  const primeCount    = leads.filter(l => l.opportunityScore >= 5).length;
  const hasEmailCount = leads.filter(l => l.contactEmail).length;
  const visible       = filter === 'prime'
    ? leads.filter(l => l.opportunityScore >= 5)
    : filter === 'hasEmail'
    ? leads.filter(l => l.contactEmail)
    : leads;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Lead Scout</h1>
        <p className="text-xs text-gray-500">
          {scanMode === 'agency'
            ? 'Find digital agencies to partner with for white-label or subcontract work.'
            : 'Find local businesses that need a website or mobile app — sorted by opportunity.'}
        </p>
        {scanMode === 'business' && (
          <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-400">
            <span className="font-semibold">Tip for owner names:</span> scan suburbs not city centres — Hackney, Brixton, Clapham, Stoke Newington etc. return independent owner-run businesses. City centres return chains (Boots, KFC, Costa) with no findable owner.
          </div>
        )}
      </div>

      {/* Search controls */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">

        {/* Scan mode toggle */}
        <div className="flex gap-1 rounded-xl border border-gray-800 bg-gray-950 p-1">
          {SCAN_MODES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleScanModeChange(value)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                scanMode === value
                  ? value === 'agency'
                    ? 'bg-violet-600 text-white'
                    : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Location */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Location</label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && scan()}
            placeholder="e.g. Hackney, London"
            className="w-full rounded-xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Type + Radius row — business mode only */}
        {scanMode === 'business' && (
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-gray-400">
                Business Types {types.length > 0 && <span className="text-gray-600">({types.length} selected — searched together)</span>}
              </label>
              {types.length > 0 && (
                <button onClick={() => setTypes([])} className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
              )}
            </div>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-700 bg-gray-950 p-2">
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {BUSINESS_TYPES.map(t => (
                  <label key={t.value} className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition ${
                    types.includes(t.value) ? 'bg-teal-500/15 text-teal-300' : 'text-gray-400 hover:bg-gray-800'
                  }`}>
                    <input type="checkbox" checked={types.includes(t.value)} onChange={() => toggleType(t.value)} className="accent-teal-500" />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Radius</label>
            <select
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-3 text-sm text-gray-100 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {RADII.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
        )}

        {/* Scan button */}
        <button
          onClick={scan}
          disabled={loading || !location.trim()}
          className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 py-3.5 text-sm font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Scanning businesses…
            </span>
          ) : scanMode === 'agency' ? 'Scan for Agencies' : 'Scan for Leads'}
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
          <div className="flex flex-wrap items-center justify-between gap-3">
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleAddAllToCrm}
                disabled={addingAll}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {addingAll ? 'Adding all…' : 'Add All to CRM'}
              </button>
              <div className="flex gap-1 rounded-xl border border-gray-800 bg-gray-900 p-1">
                {[
                  { key: 'all',      label: `All (${leads.length})`   },
                  { key: 'prime',    label: `No Website (${primeCount})` },
                  { key: 'hasEmail', label: `Has Email (${hasEmailCount})` },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      filter === key ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {addAllSummary && (
            <div className="rounded-lg border border-teal-500/20 bg-teal-500/10 px-4 py-2.5 text-xs text-teal-400">
              Added {addAllSummary.added} to the CRM{addAllSummary.skipped > 0 ? `, skipped ${addAllSummary.skipped} (already in CRM or failed)` : ''}.
            </div>
          )}

          <div className="space-y-3">
            {visible.map(lead => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onFigmaCopy={handleFigmaCopy}
                isFigmaCopied={figmaCopiedId === lead.id}
                businessType={types[0]}
                onAddToCrm={addLeadToCrm}
                crmStatus={crmStatusById[lead.id]}
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
