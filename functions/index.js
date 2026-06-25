'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp }      = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { findOwnerEmail }     = require('./leadService');
const { createGmailDraft }   = require('./gmailService');
const axios                  = require('axios');
const Parser                 = require('rss-parser');

initializeApp();
const db = getFirestore();

// ─────────────────────────────────────────────────────────────────────────────
// Template helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Original 3-sentence outreach template used by createOutreachDraft.
 * Populated from website URL + company name + owner name.
 */
function buildOutreachEmail(companyName, websiteUrl, ownerName) {
  const subject = `A quick idea for ${companyName}`;
  const body = [
    `Hi ${ownerName},`,
    '',
    `I was browsing ${companyName}'s website at ${websiteUrl} and noticed your business `
      + `doesn't appear to have a dedicated mobile app — which likely means customers `
      + `can't engage with you conveniently from their phones.`,
    `I'm a local developer who recently published the "JS Grow Up" app to the Google `
      + `Play Store — I help businesses avoid the tech headache by handling the entire `
      + `process, from design and development through launch and store submission.`,
    `I have capacity for one new local project this month; would you be open to a quick `
      + `5-minute chat to see whether a mobile app could help ${companyName} grow?`,
    '',
    'Dean Burt',
    'deanburt1308@gmail.com',
  ].join('\n');
  return { subject, body };
}

/**
 * Local Business manual template — used when leadType === 'local_business'.
 * No AI — pure string replacement on {{company_name}} and {{owner_name}}.
 */
function buildLocalBusinessEmail(companyName, ownerName, websiteUrl) {
  const greeting = ownerName?.trim() ? `Hi ${ownerName.trim()},` : 'Hi there,';
  const subject  = `A quick idea for ${companyName}`;

  const url = websiteUrl?.trim() || '';
  const isWeakSite = url && (
    url.startsWith('http://') ||
    /\.(wix|weebly|squarespace|jimdo|wordpress)\.com|facebook\.com|instagram\.com|linktr\.ee/i.test(url)
  );

  const opening = !url
    ? `I came across ${companyName} while searching for local businesses in the area and noticed you don't yet have a website or mobile app — which means potential customers can't find you online.`
    : isWeakSite
    ? `I came across ${companyName} online and noticed your current web presence may not be doing you justice — an outdated or limited website can mean losing customers to competitors before they even make contact.`
    : `I came across ${companyName}'s website and noticed you don't currently have a dedicated mobile app — which means customers can't easily engage with you from their phones.`;

  const body = `${greeting}

${opening}

I'm a local developer who recently published "JS Grow Up" to the Google Play Store. I help businesses like yours avoid the tech headache by handling the full process — design, development, and store submission — from start to finish.

I have capacity for one new local project this month. Would you be open to a quick 5-minute chat to see whether a website or app could help ${companyName} grow?

Best,
Dean Burt
deanburt1308@gmail.com`;

  return { subject, body };
}

/**
 * Digital Agency partner template — used when leadType === 'digital_agency'.
 * No AI — pure string replacement on {{agency_name}} and {{contact_name}}.
 */
function buildAgencyEmail(agencyName, contactName) {
  const greeting = contactName?.trim() ? `Hi ${contactName.trim()},` : 'Hi there,';
  const subject  = `Technical partnership inquiry — ${agencyName}`;

  const body = `${greeting}

I've been following ${agencyName}'s work and love the quality of your digital projects.

I'm a full-stack developer who recently published "JS Grow Up" (a co-parenting app) to the Google Play Store. I specialize in the full development lifecycle—from design and code to store submission—and I'm looking to partner with a few select agencies that need reliable, back-office technical capacity.

If you ever have a client project requiring app or dashboard development that falls outside your current bandwidth, I'd love to be a reliable resource you can lean on.

Are you open to a brief chat to see if we could be a fit for future overflow work?

Best,
Dean Burt
deanburt1308@gmail.com`;

  return { subject, body };
}

/**
 * Routes to the correct template based on leadType.
 * Keeps template selection in one place — add new lead types here.
 *
 * @param {'local_business'|'digital_agency'} leadType
 * @param {object} data  — companyName/agencyName, ownerName/contactName
 * @returns {{ subject: string, body: string }}
 */
function buildManualEmail(leadType, data) {
  if (leadType === 'digital_agency') {
    return buildAgencyEmail(data.companyName, data.ownerName);
  }
  return buildLocalBusinessEmail(data.companyName, data.ownerName, data.websiteUrl);
}

// ─────────────────────────────────────────────────────────────────────────────
// Function 1: createOutreachDraft
// Hunter.io email lookup → static template → Gmail draft → Firestore
// ─────────────────────────────────────────────────────────────────────────────

exports.createOutreachDraft = onCall(
  {
    cors:          true,
    timeoutSeconds: 60,
    memory:        '256MiB',
    secrets: [
      'HUNTER_KEY',
      'GMAIL_CLIENT_ID',
      'GMAIL_CLIENT_SECRET',
      'GMAIL_REFRESH_TOKEN',
    ],
  },
  async (request) => {
    const { companyName, websiteUrl, ownerName } = request.data ?? {};

    if (!companyName?.trim() || !websiteUrl?.trim() || !ownerName?.trim()) {
      throw new HttpsError('invalid-argument', 'companyName, websiteUrl, and ownerName are required.');
    }

    const normalizedUrl = websiteUrl.startsWith('http')
      ? websiteUrl.trim()
      : `https://${websiteUrl.trim()}`;

    // Write immediately so the dashboard shows "Pending" right away
    const leadRef = await db.collection('leads').add({
      companyName:  companyName.trim(),
      websiteUrl:   normalizedUrl,
      ownerName:    ownerName.trim(),
      ownerEmail:   null,
      gmailDraftId: null,
      status:       'pending',
      source:       'form',
      createdAt:    FieldValue.serverTimestamp(),
    });

    try {
      const domain    = new URL(normalizedUrl).hostname.replace(/^www\./, '');
      const ownerEmail = await findOwnerEmail(domain, ownerName.trim());

      const { subject, body } = buildOutreachEmail(
        companyName.trim(), normalizedUrl, ownerName.trim()
      );

      const gmailDraftId = await createGmailDraft({ to: ownerEmail ?? '', subject, body });

      await leadRef.update({
        ownerEmail:   ownerEmail ?? null,
        gmailDraftId,
        status:       'draft_created',
        updatedAt:    FieldValue.serverTimestamp(),
      });

      return { success: true, leadId: leadRef.id, gmailDraftId, emailFound: ownerEmail !== null };
    } catch (err) {
      console.error('[createOutreachDraft]', err.message);
      await leadRef.update({ status: 'error', errorMessage: err.message, updatedAt: FieldValue.serverTimestamp() });
      throw new HttpsError('internal', err.message);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Function 2: createManualDraft
//
// No AI, no email lookup. Routes to the correct static template based on
// leadType ('local_business' | 'digital_agency') and performs pure string
// replacement. Always creates a Gmail Draft — never sends.
//
// Flow:
//   1. Validate companyName + ownerName
//   2. Route to the correct template via buildManualEmail(leadType, data)
//   3. Create a Gmail Draft (never sends)
//   4. Write a Firestore lead record with leadType + source tracking
// ─────────────────────────────────────────────────────────────────────────────

exports.createManualDraft = onCall(
  {
    cors:          true,
    timeoutSeconds: 30,
    memory:        '256MiB',
    secrets: [
      'GMAIL_CLIENT_ID',
      'GMAIL_CLIENT_SECRET',
      'GMAIL_REFRESH_TOKEN',
    ],
  },
  async (request) => {
    const { companyName, ownerName, toEmail, websiteUrl, source, leadType } = request.data ?? {};

    if (!companyName?.trim()) {
      throw new HttpsError('invalid-argument', 'companyName is required.');
    }

    // Route to the correct template — no AI, pure string replacement
    const safeName = ownerName?.trim() ?? '';
    const { subject, body } = buildManualEmail(
      leadType ?? 'local_business',
      { companyName: companyName.trim(), ownerName: safeName }
    );

    // Write a Firestore record immediately
    const leadRef = await db.collection('leads').add({
      companyName:  companyName.trim(),
      websiteUrl:   websiteUrl ?? null,
      ownerName:    safeName,
      ownerEmail:   toEmail ?? null,
      gmailDraftId: null,
      leadType:     leadType ?? 'local_business',
      status:       'pending',
      source:       source ?? 'manual',
      createdAt:    FieldValue.serverTimestamp(),
    });

    try {
      // Create the Gmail draft — toEmail is optional; user can add recipient before sending
      const gmailDraftId = await createGmailDraft({
        to:      toEmail ?? '',
        subject,
        body,
      });

      await leadRef.update({
        gmailDraftId,
        status:    'draft_created',
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { success: true, leadId: leadRef.id, gmailDraftId };
    } catch (err) {
      console.error('[createManualDraft]', err.message);
      await leadRef.update({ status: 'error', errorMessage: err.message, updatedAt: FieldValue.serverTimestamp() });
      throw new HttpsError('internal', err.message);
    }
  }
);

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
 * 1. Hunter Email Finder  — targeted name + domain search (needs ownerName)
 * 2. Hunter Domain Search — any verified email on the domain
 * 3. Website scraping     — mailto: links + plain-text emails across 5 pages
 */
async function findContactEmail(website, ownerName) {
  if (!website) return null;

  let domain;
  try { domain = new URL(website).hostname.replace(/^www\./, ''); } catch { return null; }

  const hunterKey = process.env.HUNTER_KEY;

  // ── 1. Hunter Email Finder (name + domain) ──────────────────────────────
  if (hunterKey && ownerName) {
    const parts = ownerName.trim().split(/\s+/);
    if (parts.length >= 2) {
      try {
        const res = await axios.get('https://api.hunter.io/v2/email-finder', {
          params: { domain, first_name: parts[0], last_name: parts.slice(1).join(' '), api_key: hunterKey },
          timeout: 5_000,
        });
        const email = res.data?.data?.email;
        if (email) return email.toLowerCase();
      } catch { /* not found or quota hit */ }
    }
  }

  // ── 2. Hunter Domain Search ─────────────────────────────────────────────
  if (hunterKey) {
    try {
      const res = await axios.get('https://api.hunter.io/v2/domain-search', {
        params: { domain, api_key: hunterKey, limit: 10 },
        timeout: 5_000,
      });
      const emails = (res.data?.data?.emails ?? [])
        .sort((a, b) => {
          if (a.type === 'personal' && b.type !== 'personal') return -1;
          if (b.type === 'personal' && a.type !== 'personal') return  1;
          return (b.confidence ?? 0) - (a.confidence ?? 0);
        })
        .map(e => e.value?.toLowerCase())
        .filter(Boolean);
      const pick = pickBestEmail(emails, domain);
      if (pick) return pick;
    } catch { /* quota hit or unavailable */ }
  }

  // ── 3. Scrape homepage, contact page, about, and footer ─────────────────
  try {
    const base  = new URL(website).origin;
    const pages = [website, `${base}/contact`, `${base}/contact-us`, `${base}/about`, `${base}/about-us`];
    const opts  = { timeout: 4_000, headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 3 };
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
    secrets:        ['GOOGLE_PLACES_KEY', 'COMPANIES_HOUSE_KEY', 'HUNTER_KEY'],
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
        const email = await findContactEmail(lead.website, lead.ownerName);
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

