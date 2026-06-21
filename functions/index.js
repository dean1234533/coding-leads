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
// Function 3: fetchRssFeeds
//
// Fetches Reddit posts server-side to find potential business clients.
// Targets subreddits where business owners/entrepreneurs post about their needs.
// Scores each post for relevance to mobile/web app development services.
// ─────────────────────────────────────────────────────────────────────────────

const SUBREDDITS = [
  { sub: 'smallbusiness', source: 'r/smallbusiness', hiringOnly: false },
  { sub: 'Entrepreneur',  source: 'r/Entrepreneur',  hiringOnly: false },
  { sub: 'startups',      source: 'r/startups',      hiringOnly: false },
  { sub: 'ecommerce',     source: 'r/ecommerce',     hiringOnly: false },
  // r/forhire: only keep [Hiring] posts — the [For Hire] ones are competitors
  { sub: 'forhire',       source: 'r/forhire',       hiringOnly: true  },
];

// Keywords that suggest a business owner needs dev/app/tech work
const TECH_KEYWORDS = [
  'app', 'mobile app', 'ios', 'android', 'website', 'web app',
  'software', 'developer', 'development', 'tech', 'digital',
  'platform', 'automation', 'ecommerce', 'e-commerce', 'online store',
  'booking', 'dashboard', 'saas', 'mvp', 'build', 'integrate',
];

// Keywords that suggest the poster IS a freelancer advertising — skip these
const SKIP_KEYWORDS = [
  '[for hire]', 'for hire]', 'available for', 'available immediately',
  'i am a developer', "i'm a developer", 'hire me', 'my portfolio',
];

function scorePost(title, content) {
  const text = `${title} ${content}`.toLowerCase();
  // Skip freelancer ads
  if (SKIP_KEYWORDS.some(kw => text.includes(kw))) return -1;
  return TECH_KEYWORDS.reduce((n, kw) => n + (text.includes(kw) ? 1 : 0), 0);
}

exports.fetchRssFeeds = onCall(
  { cors: true, timeoutSeconds: 45, memory: '256MiB' },
  async () => {
    const headers = {
      'User-Agent': 'outreach-dashboard/1.0 (by /u/outreach_bot)',
      'Accept': 'application/json',
    };

    const results = await Promise.allSettled(
      SUBREDDITS.map(({ sub }) =>
        axios.get(`https://www.reddit.com/r/${sub}/new.json?limit=25`, { headers, timeout: 12_000 })
      )
    );

    const items = [];

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`[fetchRssFeeds] r/${SUBREDDITS[index].sub} failed:`, result.reason.message);
        return;
      }

      const { source, hiringOnly } = SUBREDDITS[index];
      const posts = result.value.data?.data?.children ?? [];

      posts.forEach(({ data: post }) => {
        const title = post.title ?? '(no title)';

        // For r/forhire, skip anything that isn't a [Hiring] post
        if (hiringOnly && !/^\[hiring\]/i.test(title.trim())) return;

        const content = post.selftext?.slice(0, 400) ?? '';
        const relevanceScore = scorePost(title, content);

        // Skip confirmed freelancer ads
        if (relevanceScore < 0) return;

        items.push({
          id:             post.id,
          title,
          link:           `https://www.reddit.com${post.permalink}`,
          author:         post.author ?? '',
          content:        content.slice(0, 300),
          pubDate:        new Date(post.created_utc * 1000).toISOString(),
          source,
          relevanceScore,
        });
      });
    });

    // Sort: high-relevance first, then by recency
    items.sort((a, b) =>
      b.relevanceScore !== a.relevanceScore
        ? b.relevanceScore - a.relevanceScore
        : new Date(b.pubDate) - new Date(a.pubDate)
    );

    return { items };
  }
);
