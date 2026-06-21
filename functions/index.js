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
function buildLocalBusinessEmail(companyName, ownerName) {
  const subject = `Question about ${companyName}`;

  const body = `Hi ${ownerName},

I'm a local developer who recently published "JS Grow Up," a co-parenting platform, to the Google Play Store.

Having built a platform that handles sensitive user data and complex real-time needs, I specialize in helping businesses like yours avoid the "tech headache" by handling the full app lifecycle—design, code, and store submission—from start to finish.

I'm looking to partner with one new local business this month. Are you open to a 5-minute chat to see if a mobile app could help ${companyName} scale?

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
  const subject = `Technical partnership inquiry / capacity for ${agencyName}`;

  const body = `Hi ${contactName},

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
  // Default: local_business
  return buildLocalBusinessEmail(data.companyName, data.ownerName);
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

    // Validate required fields — same for both lead types
    if (!companyName?.trim() || !ownerName?.trim()) {
      throw new HttpsError('invalid-argument', 'companyName and ownerName are required.');
    }

    // Route to the correct template — no AI, pure string replacement
    const { subject, body } = buildManualEmail(
      leadType ?? 'local_business',
      { companyName: companyName.trim(), ownerName: ownerName.trim() }
    );

    // Write a Firestore record immediately
    const leadRef = await db.collection('leads').add({
      companyName:  companyName.trim(),
      websiteUrl:   websiteUrl ?? null,
      ownerName:    ownerName.trim(),
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

function scoreOpportunity(place) {
  if (!place.website) return 5; // No website at all — highest priority
  // Has a website — still worth reaching out about an app or improvements
  return 1;
}

function opportunityLabel(place) {
  if (!place.website) return 'No Website — Prime Lead';
  return 'Has Website — App / Upgrade Opportunity';
}

exports.scanBusinessLeads = onCall(
  {
    cors:           true,
    timeoutSeconds: 60,
    memory:         '512MiB',
    secrets:        ['GOOGLE_PLACES_KEY'],
  },
  async (request) => {
    const {
      location   = 'London, UK',
      radius     = 2000,         // metres
      type       = 'restaurant',
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

    // ── Step 2: Nearby business search ──────────────────────────────────────
    let places = [];
    try {
      const searchRes = await axios.get(
        'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
        {
          params: {
            location: `${lat},${lng}`,
            radius,
            type,
            key: apiKey,
          },
          timeout: 15_000,
        }
      );
      places = (searchRes.data.results ?? []).slice(0, maxResults);
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

    // ── Step 4: Score and shape the leads ───────────────────────────────────
    const leads = detailResults
      .map((r, i) => {
        if (r.status === 'rejected') {
          console.warn('[scanBusinessLeads] detail fetch failed:', r.reason.message);
          // Fall back to the basic Nearby Search data
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
        };
      })
      // Highest opportunity first, then by fewest reviews (smaller = easier to win)
      .sort((a, b) =>
        b.opportunityScore !== a.opportunityScore
          ? b.opportunityScore - a.opportunityScore
          : (a.reviewCount ?? 999) - (b.reviewCount ?? 999)
      );

    return {
      leads,
      meta: { location, type, radius, found: leads.length },
    };
  }
);

