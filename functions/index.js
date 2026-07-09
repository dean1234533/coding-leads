'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule }         = require('firebase-functions/v2/scheduler');
const { initializeApp }      = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { sendEmail } = require('./gmailService');
const { getFreeBusy, createCalendarEvent, generateSlots, filterFreeSlots } = require('./calendarService');
const { ensureConfigDocs, runScan } = require('./codingLeadsService');
const axios                  = require('axios');
const Parser                 = require('rss-parser');
const {
  getGmailAuthUrl, gmailOAuthCallback, disconnectGmail,
} = require('./gmailOAuth');
const {
  gmailListMessages, gmailGetThread, gmailSendEmail, gmailSaveDraft,
  gmailListLabels, getGmailSentStats, checkRepliesNow, syncGmailReplies,
  sendScheduledEmails,
} = require('./crmGmailService');
const { findLeadEmail, migrateLegacyLeads } = require('./crmMigration');

initializeApp();
const db = getFirestore();

// ─── Outreach CRM: Gmail OAuth + inbox/sent/compose/reply-detection ─────────
exports.getGmailAuthUrl    = getGmailAuthUrl;
exports.gmailOAuthCallback = gmailOAuthCallback;
exports.disconnectGmail    = disconnectGmail;
exports.gmailListMessages  = gmailListMessages;
exports.gmailGetThread     = gmailGetThread;
exports.gmailSendEmail     = gmailSendEmail;
exports.gmailSaveDraft     = gmailSaveDraft;
exports.gmailListLabels    = gmailListLabels;
exports.getGmailSentStats  = getGmailSentStats;
exports.checkRepliesNow    = checkRepliesNow;
exports.syncGmailReplies   = syncGmailReplies;
exports.sendScheduledEmails = sendScheduledEmails;
exports.findLeadEmail      = findLeadEmail;
exports.migrateLegacyLeads = migrateLegacyLeads;

// ─────────────────────────────────────────────────────────────────────────────
// Function 3: scanBusinessLeads
//
// Uses Google Places API to find real local businesses, then checks each one
// for digital opportunity signals:
//   • No website at all         → prime lead (score 5)
//   • Website but no app listed → strong lead (score 3)
//   • Has website               → standard lead (score 1)
//
// The frontend receives a sorted list of real businesses the user can reach
// out to about building/improving their app or website.
// ─────────────────────────────────────────────────────────────────────────────

// Business types that are strong candidates for app/website development work
const BUSINESS_TYPES = [
  { value: 'restaurant',        label: 'Restaurants & Cafés'   },
  { value: 'beauty_salon',      label: 'Beauty & Hair Salons'  },
  { value: 'gym',               label: 'Gyms & Fitness'        },
  { value: 'lawyer',            label: 'Law Firms'             },
  { value: 'real_estate_agency',label: 'Estate Agents'         },
  { value: 'accounting',        label: 'Accountants'           },
  { value: 'plumber',           label: 'Tradespeople'          },
  { value: 'clothing_store',    label: 'Retail / Clothing'     },
  { value: 'car_repair',        label: 'Auto Services'         },
  { value: 'dentist',           label: 'Dentists & Medical'    },
  { value: 'store',             label: 'General Retail'        },
];

// Free/amateur website builders and hosting platforms
const WEAK_WEBSITE_PATTERNS = [
  /\.wix\.com/i,
  /\.weebly\.com/i,
  /\.squarespace\.com/i,
  /\.jimdo\.com/i,
  /\.webnode\./i,
  /\.moonfruit\.com/i,
  /\.yolasite\.com/i,
  /\.wordpress\.com/i,   // .com = free hosted, not self-hosted
  /\.blogspot\.com/i,
  /\.godaddysites\.com/i,
  /\.myshopify\.com/i,   // Shopify free subdomain (no custom domain)
  /facebook\.com/i,      // using Facebook page as website
  /instagram\.com/i,     // using Instagram as website
  /linktr\.ee/i,         // Linktree = no real website
  /linkinbio/i,
];

function scoreOpportunity(place) {
  if (!place.website) return 5;
  // No SSL — outdated site
  if (place.website.startsWith('http://')) return 3;
  // Free builder or social page used as website
  if (WEAK_WEBSITE_PATTERNS.some(p => p.test(place.website))) return 3;
  return 1;
}

function opportunityLabel(place) {
  if (!place.website) return 'No Website — Prime Lead';
  if (place.website.startsWith('http://') || WEAK_WEBSITE_PATTERNS.some(p => p.test(place.website))) {
    return 'Weak Website — Redesign Opportunity';
  }
  return 'Has Website — App / Upgrade Opportunity';
}

/** Title-cases a word ("SMITH" → "Smith") */
function cap(str = '') {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Source 1 — parse the business name itself.
 * A large proportion of UK small businesses are named after their owner:
 *   "Sarah's Beauty Salon"  → "Sarah"
 *   "Khan's Curry House"    → "Khan"
 *   "Dean Burt Plumbing"    → "Dean Burt"
 * Returns a first name (or full name if embedded), or null.
 */
function guessOwnerFromBusinessName(rawName) {
  if (!rawName) return null;

  // Normalise curly/smart apostrophes (Google Places uses U+2019 '') to straight '
  const businessName = rawName.replace(/[‘’‚‛ʼ]/g, "'");

  // "Sarah's Salon" / "Khan's Curry" / "Giuseppe's Kitchen" / "Nando's"
  // Only the possessive pattern reliably identifies a person's name.
  const possessive = businessName.match(/^([A-ZÀ-ÿ][a-zA-ZÀ-ÿ-]{1,18})'s?\b/);
  if (possessive) return cap(possessive[1]);

  return null;
}

/**
 * Source 2 — scrape the business website with real Chrome headers.
 * Tries homepage + 5 common sub-pages (About, Team, Contact…).
 * Checks JSON-LD structured data first, then text patterns.
 * Returns null on any failure — never throws.
 */
async function findOwnerFromWebsite(websiteUrl) {
  if (!websiteUrl) return null;

  const BROWSER_HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control':   'no-cache',
  };

  const FETCH_OPTS = {
    timeout:          7_000,
    headers:          BROWSER_HEADERS,
    maxRedirects:     3,
    maxContentLength: 400_000,
  };

  let base;
  try { base = new URL(websiteUrl).origin; } catch { return null; }

  const pagesToTry = [
    websiteUrl,
    `${base}/about`,
    `${base}/about-us`,
    `${base}/our-story`,
    `${base}/team`,
    `${base}/contact`,
  ];

  const TEXT_PATTERNS = [
    // "Owner John Smith" / "Director: Jane Doe" / "Founded by David Brown"
    /\b(?:owner|proprietor|founder|co-founder|director|principal|ceo|established by|run by|created by)\b[\s:,–\-]+([A-Z][a-zÀ-ÿ'\-]{1,20}(?: [A-Z][a-zÀ-ÿ'\-]{1,20})?)/i,
    // "John Smith, owner" / "Jane Doe - Founder"
    /([A-Z][a-zÀ-ÿ'\-]{1,20} [A-Z][a-zÀ-ÿ'\-]{1,20})[,\s\-–]+(?:owner|founder|director|principal|proprietor)\b/i,
    // "I'm Jane Smith, the owner"
    /\bi['']m ([A-Z][a-zÀ-ÿ'\-]{1,20} [A-Z][a-zÀ-ÿ'\-]{1,20}),?\s+(?:the\s+)?(?:owner|founder|director|chef|stylist|barber|therapist|trainer)/i,
    // "Hi, I'm John" / "Hello, I'm Sarah Smith"
    /\b(?:hi|hello|hey)[,!]?\s+i['']m ([A-Z][a-zÀ-ÿ'\-]{1,20} [A-Z][a-zÀ-ÿ'\-]{1,20})\b/i,
    // "My name is John Smith"
    /\bmy name is ([A-Z][a-zÀ-ÿ'\-]{1,20} [A-Z][a-zÀ-ÿ'\-]{1,20})\b/i,
  ];

  for (const url of pagesToTry) {
    try {
      const res  = await axios.get(url, FETCH_OPTS);
      const html = typeof res.data === 'string' ? res.data : '';
      if (!html) continue;

      // 1. JSON-LD structured data
      for (const [, jsonStr] of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
          const schemas = [].concat(JSON.parse(jsonStr));
          for (const s of schemas) {
            const name =
              s?.owner?.name   ??
              s?.founder?.name ??
              (s?.['@type'] === 'Person' ? s?.name : null) ??
              null;
            if (name && typeof name === 'string' && name.trim().includes(' ')) {
              return name.trim();
            }
          }
        } catch { /* malformed JSON-LD */ }
      }

      // 2. Text patterns on stripped HTML
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');

      for (const pattern of TEXT_PATTERNS) {
        const m = text.match(pattern);
        if (m?.[1] && m[1].trim().length > 3) return m[1].trim();
      }
    } catch { /* page blocked or not found — try next */ }
  }

  return null;
}

/**
 * Source 3 — Companies House API (UK).
 * Searches registered companies by name, then fetches their active directors.
 * Most reliable source for any registered UK business.
 */
async function findOwnerFromCompaniesHouse(rawName) {
  const apiKey = process.env.COMPANIES_HOUSE_KEY;
  if (!apiKey) return null;

  const businessName = rawName.replace(/[‘’‚‛ʼ]/g, "'");

  try {
    const searchRes = await axios.get(
      'https://api.company-information.service.gov.uk/search/companies',
      {
        params: { q: businessName, items_per_page: 3 },
        auth:   { username: apiKey, password: '' },
        timeout: 3_000,
      }
    );

    const company =
      searchRes.data.items?.find(c => c.company_status === 'active') ??
      searchRes.data.items?.[0];

    if (!company?.company_number) return null;

    const officersRes = await axios.get(
      `https://api.company-information.service.gov.uk/company/${company.company_number}/officers`,
      {
        params: { items_per_page: 10 },
        auth:   { username: apiKey, password: '' },
        timeout: 6_000,
      }
    );

    const officers = officersRes.data.items ?? [];
    const director =
      officers.find(o =>
        !o.resigned_on &&
        ['director', 'llp-member', 'llp-designated-member', 'corporate-director'].includes(o.officer_role)
      ) ?? officers.find(o => !o.resigned_on);

    if (!director) return null;

    // Companies House returns "SURNAME, Firstname Middlename"
    const els = director.name_elements;
    if (els?.forename && els?.surname) {
      return `${cap(els.forename.split(' ')[0])} ${cap(els.surname)}`;
    }
    const parts = (director.name ?? '').split(',').map(s => s.trim());
    if (parts.length >= 2) {
      return `${cap(parts[1].split(' ')[0])} ${cap(parts[0])}`;
    }
    return cap(director.name) || null;
  } catch {
    return null;
  }
}

const IGNORED_EMAIL_PREFIXES = ['noreply', 'no-reply', 'donotreply', 'privacy', 'legal', 'abuse', 'webmaster', 'postmaster', 'unsubscribe', 'bounce', 'hello@wix', 'support@'];
const EMAIL_REGEX = /\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/g;

function pickBestEmail(emails, domain) {
  if (!emails.length) return null;
  // Filter out ignored prefixes and emails not on the business domain
  const onDomain  = emails.filter(e => e.includes(`@${domain}`) && !IGNORED_EMAIL_PREFIXES.some(p => e.startsWith(p)));
  const anyGood   = emails.filter(e => !IGNORED_EMAIL_PREFIXES.some(p => e.startsWith(p)));
  return onDomain[0] ?? anyGood[0] ?? emails[0];
}

function extractEmailsFromHtml(html, domain) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

  // mailto: links first (most explicit), then plain-text emails in content
  const mailto = [...html.matchAll(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi)].map(m => m[1].toLowerCase());
  const plain  = [...stripped.matchAll(EMAIL_REGEX)].map(m => m[1].toLowerCase());
  const all    = [...new Set([...mailto, ...plain])];
  return pickBestEmail(all, domain);
}

/**
 * Finds a contact email for a business.
 * 1. Serper Google search  — concurrent queries; scrapes actual result URLs
 * 2. Hunter Email Finder   — targeted name + domain search (needs ownerName)
 * 3. Hunter Domain Search  — any verified email on the domain
 * 4. Website scraping      — mailto: links + plain-text emails across 7 pages
 *
 * All sub-steps run concurrently where possible to stay within the 60s budget.
 */
async function findContactEmail(website, ownerName, businessName) {
  if (!website && !businessName) return null;

  let domain = null;
  if (website) {
    try { domain = new URL(website).hostname.replace(/^www\./, ''); } catch {}
  }

  const serperKey = process.env.SERPER_KEY;
  const hunterKey = process.env.HUNTER_KEY;

  // ── 1. Serper Google search ─────────────────────────────────────────────
  // Run all queries concurrently, then scrape the actual result pages that
  // Google found — snippets are truncated but full pages have the emails.
  if (serperKey) {
    const queries = [];
    if (domain)       queries.push(`site:${domain} email`);
    if (businessName) queries.push(`"${businessName}" email contact`);

    const serperResults = await Promise.allSettled(
      queries.map(q =>
        axios.post(
          'https://google.serper.dev/search',
          { q, num: 5 },
          { headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' }, timeout: 5_000 }
        )
      )
    );

    // Collect discovered URLs and check snippets/knowledgeGraph immediately
    const discoveredUrls = [];
    for (const r of serperResults) {
      if (r.status !== 'fulfilled') continue;
      const data = r.value.data ?? {};

      // Knowledge graph / answer box sometimes has the email inline
      const quickText = JSON.stringify(data.knowledgeGraph ?? '') + ' ' +
                        JSON.stringify(data.answerBox ?? '');
      const quickEmail = extractEmailsFromHtml(quickText, domain ?? '');
      if (quickEmail) return quickEmail;

      // Snippet scan
      const snippetText = (data.organic ?? [])
        .map(row => `${row.title ?? ''} ${row.snippet ?? ''}`)
        .join(' ');
      const snippetEmail = extractEmailsFromHtml(snippetText, domain ?? '');
      if (snippetEmail) return snippetEmail;

      // Queue top-2 result URLs for full-page scraping
      (data.organic ?? []).slice(0, 2).forEach(row => row.link && discoveredUrls.push(row.link));
    }

    // Scrape the actual pages Google found — far more complete than snippets
    if (discoveredUrls.length) {
      const uniqueUrls = [...new Set(discoveredUrls)].slice(0, 6);
      const pageResults = await Promise.allSettled(
        uniqueUrls.map(url =>
          axios.get(url, { timeout: 4_000, headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 3 })
        )
      );
      for (const r of pageResults) {
        if (r.status !== 'fulfilled') continue;
        const html  = typeof r.value.data === 'string' ? r.value.data : '';
        const email = extractEmailsFromHtml(html, domain ?? '');
        if (email) return email;
      }
    }
  }

  if (!domain) return null;

  // ── 2 & 3. Hunter Email Finder + Domain Search (concurrent) ─────────────
  if (hunterKey) {
    const hunterCalls = [];

    if (ownerName) {
      const parts = ownerName.trim().split(/\s+/);
      if (parts.length >= 2) {
        hunterCalls.push(
          axios.get('https://api.hunter.io/v2/email-finder', {
            params: { domain, first_name: parts[0], last_name: parts.slice(1).join(' '), api_key: hunterKey },
            timeout: 5_000,
          }).then(r => r.data?.data?.email?.toLowerCase() ?? null).catch(() => null)
        );
      }
    }

    hunterCalls.push(
      axios.get('https://api.hunter.io/v2/domain-search', {
        params: { domain, api_key: hunterKey, limit: 10 },
        timeout: 5_000,
      }).then(r => {
        const emails = (r.data?.data?.emails ?? [])
          .sort((a, b) => {
            if (a.type === 'personal' && b.type !== 'personal') return -1;
            if (b.type === 'personal' && a.type !== 'personal') return  1;
            return (b.confidence ?? 0) - (a.confidence ?? 0);
          })
          .map(e => e.value?.toLowerCase()).filter(Boolean);
        return pickBestEmail(emails, domain);
      }).catch(() => null)
    );

    const hunterEmails = await Promise.all(hunterCalls);
    for (const email of hunterEmails) {
      if (email) return email;
    }
  }

  // ── 4. Scrape website pages (7 common contact locations) ─────────────────
  try {
    const base  = new URL(website).origin;
    const pages = [
      website,
      `${base}/contact`,
      `${base}/contact-us`,
      `${base}/get-in-touch`,
      `${base}/about`,
      `${base}/about-us`,
      `${base}/team`,
    ];
    const opts = { timeout: 4_000, headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 3 };
    const results = await Promise.allSettled(pages.map(url => axios.get(url, opts)));
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const html  = typeof r.value.data === 'string' ? r.value.data : '';
      const email = extractEmailsFromHtml(html, domain);
      if (email) return email;
    }
  } catch { /* all pages blocked */ }

  return null;
}

/**
 * Master owner-name resolver.
 *   1. Business name parsing  (instant — "Sarah's Salon" → "Sarah")
 *   2. Companies House API    (authoritative for registered UK companies)
 * Website scraping removed — sequential page fetches caused function timeouts.
 */
async function findOwnerName(businessName) {
  const guessed = guessOwnerFromBusinessName(businessName);
  if (guessed) return { name: guessed, source: 'business name' };

  const chName = await findOwnerFromCompaniesHouse(businessName);
  if (chName) return { name: chName, source: 'Companies House' };

  return null;
}

exports.scanBusinessLeads = onCall(
  {
    cors:           true,
    timeoutSeconds: 60,
    memory:         '512MiB',
    secrets:        ['GOOGLE_PLACES_KEY', 'COMPANIES_HOUSE_KEY', 'HUNTER_KEY', 'SERPER_KEY'],
  },
  async (request) => {
    const {
      location   = 'London, UK',
      radius     = 2000,
      type       = 'restaurant',
      scanMode   = 'business',    // 'business' | 'agency'
      maxResults = 20,
    } = request.data ?? {};

    const apiKey = process.env.GOOGLE_PLACES_KEY;
    if (!apiKey) throw new HttpsError('internal', 'GOOGLE_PLACES_KEY secret not set.');

    // ── Step 1: Geocode the location string to lat/lng ──────────────────────
    let lat, lng;
    try {
      const geoRes = await axios.get(
        'https://maps.googleapis.com/maps/api/geocode/json',
        { params: { address: location, key: apiKey }, timeout: 10_000 }
      );
      if (!geoRes.data.results?.length) {
        throw new HttpsError('invalid-argument', `Could not geocode location: "${location}"`);
      }
      ({ lat, lng } = geoRes.data.results[0].geometry.location);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', `Geocoding failed: ${err.message}`);
    }

    // ── Step 2: Search for places ────────────────────────────────────────────
    let places = [];
    try {
      if (scanMode === 'agency') {
        // Text Search finds agencies by keyword — no Places type exists for them
        const searchRes = await axios.get(
          'https://maps.googleapis.com/maps/api/place/textsearch/json',
          {
            params: {
              query:    `digital agency ${location}`,
              location: `${lat},${lng}`,
              radius,
              key:      apiKey,
            },
            timeout: 15_000,
          }
        );
        places = (searchRes.data.results ?? []).slice(0, maxResults);
      } else {
        const searchRes = await axios.get(
          'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
          {
            params: { location: `${lat},${lng}`, radius, type, key: apiKey },
            timeout: 15_000,
          }
        );
        places = (searchRes.data.results ?? []).slice(0, maxResults);
      }
    } catch (err) {
      throw new HttpsError('internal', `Places search failed: ${err.message}`);
    }

    if (!places.length) return { leads: [], meta: { location, type, radius } };

    // ── Step 3: Fetch details (website, phone) for each place in parallel ───
    const detailResults = await Promise.allSettled(
      places.map(p =>
        axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
          params: {
            place_id: p.place_id,
            fields:   'name,formatted_address,formatted_phone_number,website,types,rating,user_ratings_total,business_status,url',
            key:      apiKey,
          },
          timeout: 10_000,
        })
      )
    );

    // ── Step 4: Shape basic lead objects ────────────────────────────────────
    const rawLeads = detailResults.map((r, i) => {
      if (r.status === 'rejected') {
        console.warn('[scanBusinessLeads] detail fetch failed:', r.reason.message);
        const p = places[i];
        return {
          id:               p.place_id,
          name:             p.name,
          address:          p.vicinity ?? '',
          phone:            null,
          website:          null,
          googleMapsUrl:    null,
          rating:           p.rating ?? null,
          reviewCount:      p.user_ratings_total ?? 0,
          types:            p.types ?? [],
          hasWebsite:       false,
          opportunityScore: 5,
          opportunityLabel: 'No Website — Prime Lead',
          ownerName:        null,
        };
      }
      const d = r.value.data.result ?? {};
      const hasWebsite = !!d.website;
      return {
        id:               places[i].place_id,
        name:             d.name ?? places[i].name,
        address:          d.formatted_address ?? '',
        phone:            d.formatted_phone_number ?? null,
        website:          d.website ?? null,
        googleMapsUrl:    d.url ?? null,
        rating:           d.rating ?? null,
        reviewCount:      d.user_ratings_total ?? 0,
        types:            d.types ?? [],
        hasWebsite,
        opportunityScore: scoreOpportunity(d),
        opportunityLabel: opportunityLabel(d),
        ownerName:        null,
        contactEmail:     null,
      };
    });

    // ── Step 5: Resolve owner names + contact emails in parallel ───────────
    console.log('[owner] business names:', rawLeads.slice(0, 15).map(l => l.name));
    await Promise.allSettled(
      rawLeads.slice(0, 15).map(async (lead) => {
        const ownerResult = await findOwnerName(lead.name);
        lead.ownerName       = ownerResult?.name   ?? null;
        lead.ownerNameSource = ownerResult?.source ?? null;
        const email = await findContactEmail(lead.website, lead.ownerName, lead.name);
        console.log(`[owner] "${lead.name}" → ${ownerResult ? `${ownerResult.name} (${ownerResult.source})` : 'null'} | email: ${email ?? 'none'}`);
        lead.contactEmail    = email ?? null;
      })
    );

    // ── Step 6: Sort and return ──────────────────────────────────────────────
    const leads = rawLeads.sort((a, b) =>
      b.opportunityScore !== a.opportunityScore
        ? b.opportunityScore - a.opportunityScore
        : (a.reviewCount ?? 999) - (b.reviewCount ?? 999)
    );

    return {
      leads,
      meta: { location, type, radius, scanMode, found: leads.length },
    };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Booking Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Function 4: getAvailableSlots
 * Reads the owner's Google Calendar and returns free slots for the next N days.
 * Called only by the authenticated dashboard (Dean's view).
 */
exports.getAvailableSlots = onCall(
  {
    cors:           true,
    timeoutSeconds: 30,
    memory:         '256MiB',
    secrets:        ['CALENDAR_CLIENT_ID', 'CALENDAR_CLIENT_SECRET', 'CALENDAR_REFRESH_TOKEN'],
  },
  async (request) => {
    const { durationMins = 60, daysAhead = 14 } = request.data ?? {};

    const now  = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() + 1); // start tomorrow
    from.setHours(0, 0, 0, 0);

    const to = new Date(from);
    to.setDate(to.getDate() + daysAhead);
    to.setHours(23, 59, 59, 999);

    const busyTimes     = await getFreeBusy(from.toISOString(), to.toISOString());
    const allSlots      = generateSlots(from, to, durationMins);
    const freeSlots     = filterFreeSlots(allSlots, busyTimes);

    return { slots: freeSlots, durationMins };
  }
);

/**
 * Function 4b: getBookingSettings
 * Returns the saved booking config (title, duration, approvedSlots).
 * Server-side so it bypasses Firestore security rules.
 */
exports.getBookingSettings = onCall(
  { cors: true, timeoutSeconds: 10, memory: '256MiB' },
  async () => {
    const snap = await db.collection('booking_config').doc('default').get();
    if (!snap.exists) {
      return { title: 'Discovery Call — Dean Burt', durationMins: 15, approvedSlots: [] };
    }
    const data = snap.data();
    return {
      title:         data.title         ?? 'Discovery Call — Dean Burt',
      durationMins:  data.durationMins  ?? 15,
      approvedSlots: data.approvedSlots ?? [],
    };
  }
);

/**
 * Function 5: updateBookingSettings (authenticated)
 * Dean saves his booking title and slot duration to Firestore.
 */
exports.updateBookingSettings = onCall(
  {
    cors:           true,
    timeoutSeconds: 10,
    memory:         '256MiB',
  },
  async (request) => {
    const { title, durationMins, approvedSlots } = request.data ?? {};
    const payload = { updatedAt: FieldValue.serverTimestamp() };
    if (title        !== undefined) payload.title        = title;
    if (durationMins !== undefined) payload.durationMins = durationMins;
    if (approvedSlots !== undefined) payload.approvedSlots = approvedSlots; // array of slot ISO strings or null to show all
    await db.collection('booking_config').doc('default').set(payload, { merge: true });
    return { success: true };
  }
);

/**
 * Function 6: getLiveAvailability (public — no auth required)
 * Reads Google Calendar in real time and returns free slots.
 * Powers the permanent /book page — the link never changes.
 */
exports.getLiveAvailability = onCall(
  {
    cors:           true,
    timeoutSeconds: 30,
    memory:         '256MiB',
    secrets:        ['CALENDAR_CLIENT_ID', 'CALENDAR_CLIENT_SECRET', 'CALENDAR_REFRESH_TOKEN'],
  },
  async () => {
    // Load settings from Firestore
    const configDoc = await db.collection('booking_config').doc('default').get();
    const config    = configDoc.exists ? configDoc.data() : {};
    const durationMins = config.durationMins ?? 60;
    const title        = config.title ?? 'Discovery Call — Dean Burt';

    const now  = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() + 1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 14);
    to.setHours(23, 59, 59, 999);

    const busyTimes = await getFreeBusy(from.toISOString(), to.toISOString());
    const allSlots  = generateSlots(from, to, durationMins);
    const freeSlots = filterFreeSlots(allSlots, busyTimes);

    // If Dean has hand-picked slots, filter to only those that are still free
    const approvedSlots = config.approvedSlots;
    let visibleSlots = freeSlots;
    if (Array.isArray(approvedSlots) && approvedSlots.length > 0) {
      const approvedSet = new Set(approvedSlots);
      visibleSlots = freeSlots.filter(s => approvedSet.has(s.start));
    }

    return { slots: visibleSlots, durationMins, title };
  }
);

/**
 * Function 7: confirmBooking (public — no auth required)
 * Client confirms a slot → creates Google Calendar event → marks slot taken.
 */
exports.confirmBooking = onCall(
  {
    cors:           true,
    timeoutSeconds: 30,
    memory:         '256MiB',
    secrets:        ['CALENDAR_CLIENT_ID', 'CALENDAR_CLIENT_SECRET', 'CALENDAR_REFRESH_TOKEN', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'TOKEN_ENCRYPTION_KEY'],
  },
  async (request) => {
    const { slotStart, slotEnd, clientName, clientEmail, clientNote } = request.data ?? {};

    if (!slotStart || !slotEnd || !clientName || !clientEmail) {
      throw new HttpsError('invalid-argument', 'Missing required booking fields.');
    }

    // Load title from settings
    const configDoc = await db.collection('booking_config').doc('default').get();
    const title     = configDoc.exists ? (configDoc.data().title ?? 'Discovery Call — Dean Burt') : 'Discovery Call — Dean Burt';

    const startDt = new Date(slotStart);
    const timeStr = startDt.toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'full', timeStyle: 'short' });

    await createCalendarEvent({
      summary:       `${title} — ${clientName}`,
      description:   `Client: ${clientName}\nEmail: ${clientEmail}${clientNote ? `\nNote: ${clientNote}` : ''}`,
      startTime:     slotStart,
      endTime:       slotEnd,
      attendeeEmail: clientEmail,
      attendeeName:  clientName,
    });

    // Notify Dean
    await sendEmail({
      to:      'deanburt1308@gmail.com',
      subject: `New booking: ${clientName} — ${timeStr}`,
      body:    `You have a new booking!\n\nName:  ${clientName}\nEmail: ${clientEmail}\nTime:  ${timeStr}${clientNote ? `\nNote:  ${clientNote}` : ''}\n\nIt's been added to your Google Calendar.`,
    }).catch(() => {}); // don't fail the booking if the notification errors

    return { success: true, confirmedTime: timeStr };
  }
);

/**
 * Emails Dean when a scan turns up new high-intent-score leads, so he can
 * respond fast instead of relying on checking the dashboard.
 */
async function notifyHighScoreLeads(newHighScoreLeads) {
  if (!newHighScoreLeads?.length) return;
  const lines = newHighScoreLeads
    .map((l) => `• [${l.intentScore}] ${l.title} (${l.leadType}) — ${l.source}\n  ${l.url}`)
    .join('\n\n');
  await sendEmail({
    to:      'deanburt1308@gmail.com',
    subject: `${newHighScoreLeads.length} new high-intent coding lead${newHighScoreLeads.length === 1 ? '' : 's'} found`,
    body:    `New coding leads scoring 60+ just came in:\n\n${lines}\n\nOpen the Coding Leads dashboard to respond.`,
  }).catch(() => {}); // don't fail the scan if the email fails
}

const CODING_LEADS_SECRETS = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'TOKEN_ENCRYPTION_KEY'];

/**
 * Function 8: scanCodingLeadsNow (authenticated, manual trigger)
 * Polls configured public RSS feeds (e.g. subreddit feeds), scores each post
 * against the Coding Leads keyword lists, and saves new high-relevance posts
 * as leads. Safe to call repeatedly — already-seen posts are skipped.
 */
exports.scanCodingLeadsNow = onCall(
  { cors: true, timeoutSeconds: 120, memory: '256MiB', secrets: CODING_LEADS_SECRETS },
  async () => {
    await ensureConfigDocs(db);
    const result = await runScan(db, FieldValue);
    await notifyHighScoreLeads(result.newHighScoreLeads);
    return result;
  }
);

/**
 * Function 9: scheduledCodingLeadsScan
 * Runs the same scan automatically every 6 hours so leads show up without
 * needing to click "Scan Now".
 */
exports.scheduledCodingLeadsScan = onSchedule(
  { schedule: 'every 6 hours', timeoutSeconds: 300, memory: '256MiB', secrets: CODING_LEADS_SECRETS },
  async () => {
    await ensureConfigDocs(db);
    const result = await runScan(db, FieldValue);
    await notifyHighScoreLeads(result.newHighScoreLeads);
  }
);

