'use strict';

const axios = require('axios');

// ─── Default search queries (seeded into Firestore on first run, editable after) ──
// Aimed at pages that already list similar free tools — "resource" pages,
// "best free X tools" roundups, directories that accept submissions — since
// those are realistic backlink targets, unlike a random blog post.
const DEFAULT_QUERIES = [
  'best free tools for web developers resources',
  'free online tools directory submit your tool',
  'developer resources list add your tool',
  'best QR code generators free 2026 list',
  'best free invoice generator for freelancers list',
  'best color palette generators online list',
  'free SEO tools list meta title description generator',
  'useful free tools for freelancers resource list',
  'best free password generator tools list',
  'free website tools for small business owners list',
  'best UUID generator online tools',
  'free developer tools roundup 2026',
];

// A result must look like an actual list/resource page, not a random forum
// post or product page, to be worth a backlink email at all.
const RELEVANCE_KEYWORDS = [
  'resources', 'resource', 'tools', 'best', 'list', 'roundup', 'directory',
  'submit', 'suggest', 'add your', 'free tools', 'useful tools',
];

function hasRelevance(text) {
  const lower = String(text ?? '').toLowerCase();
  return RELEVANCE_KEYWORDS.some((k) => lower.includes(k));
}

function domainFrom(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// The page title ("Best AI Coding Tools for Developers in 2026") makes a
// broken business name in outreach copy ("I came across Best AI Coding
// Tools..."). Guess a readable site name from the domain instead, e.g.
// "builder.io" -> "Builder".
function guessSiteNameFromDomain(domain) {
  const label = domain.split('.')[0] ?? '';
  if (!label) return domain;
  return label.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function hashId(str) {
  let hash = 0;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return `backlink_${hash.toString(36)}`;
}

async function ensureBacklinkConfig(db) {
  const ref = db.collection('backlinkConfig').doc('queries');
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ list: DEFAULT_QUERIES });
  }
}

// SerpAPI (serpapi.com) — a single API key, no cloud project/billing setup.
// Free tier: 100 searches/month. Requires the SERPAPI_KEY secret, set up
// once by Dean (see setup instructions given after deploy).
async function runBacklinkScan(db, FieldValue, { apiKey }) {
  const queriesSnap = await db.collection('backlinkConfig').doc('queries').get();
  const queries = queriesSnap.exists ? (queriesSnap.data().list ?? DEFAULT_QUERIES) : DEFAULT_QUERIES;

  let scanned = 0;
  let added = 0;
  const perQuery = [];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      const { data } = await axios.get('https://serpapi.com/search.json', {
        params: { engine: 'google', q, num: 10, api_key: apiKey },
        timeout: 15000,
      });
      const items = data.organic_results ?? [];
      let addedForQuery = 0;

      for (const item of items) {
        scanned++;
        const text = `${item.title ?? ''} ${item.snippet ?? ''}`;
        if (!hasRelevance(text)) continue;

        const domain = domainFrom(item.link);
        if (!domain) continue;

        const id = hashId(domain);
        const ref = db.collection('crmLeads').doc(id);
        const existing = await ref.get();
        if (existing.exists) continue;

        await ref.set({
          businessName: guessSiteNameFromDomain(domain),
          website: item.link ?? '',
          contactName: null,
          email: null,
          demoUrl: null,
          status: 'New',
          priority: 'Low',
          source: 'Backlink Scanner',
          category: 'Backlink',
          tags: ['Backlink'],
          notes: `Found via search: "${q}"\n\nPage: ${item.title ?? ''}\n${item.snippet ?? ''}`,
          dateAdded: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        added++;
        addedForQuery++;
      }
      perQuery.push({ query: q, found: items.length, added: addedForQuery });
    } catch (err) {
      perQuery.push({ query: q, error: err.response?.data?.error ?? err.message });
    }
  }

  return { scanned, added, perQuery };
}

module.exports = { DEFAULT_QUERIES, ensureBacklinkConfig, runBacklinkScan };
