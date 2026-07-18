'use strict';

const axios = require('axios');

// ─── Default search queries (seeded into Firestore on first run, editable after) ──
// Two angles, both genuine reasons to ask for a backlink rather than a cold,
// unexplained ask: (1) directory/roundup pages that list free tools — a
// real fit for the free tools on dean-da-dev.co.uk, and (2) real web dev/
// design/tech blogs that openly invite outside writers ("write for us"
// pages, guest post guidelines) — a fit for offering to write a free
// article. Which angle a given match fits is detected below from which
// keyword group its title/snippet hits, so the right outreach template
// (tool suggestion vs. guest post pitch) is obvious from the lead's notes.
const DEFAULT_QUERIES = [
  // Tool-directory angle
  'best free tools for web developers resources',
  'free online tools directory submit your tool',
  'developer resources list add your tool',
  'best QR code generators free 2026 list',
  'best free invoice generator for freelancers list',
  'free SEO tools list meta title description generator',
  'useful free tools for freelancers resource list',
  'free website tools for small business owners list',
  // Guest-post angle
  '"write for us" web development blog',
  '"write for us" web design blog',
  '"guest post guidelines" web development',
  '"guest post guidelines" web design',
  '"submit a guest post" javascript blog',
  '"become a contributor" tech blog',
  '"guest author" coding blog',
  'freelance web developer "guest blogging"',
  '"contribute an article" web design blog',
  '"write for us" UX UI design',
  '"accepting guest posts" programming blog',
  '"guest post" small business website tips blog',
];

// Tool-directory angle: the page already lists similar free tools, so
// suggesting dean-da-dev.co.uk's tools for inclusion is a genuine fit.
const TOOL_KEYWORDS = [
  'resources', 'resource', 'tools', 'best', 'list', 'roundup', 'directory',
  'submit', 'suggest', 'add your', 'free tools', 'useful tools',
];

// Guest-post angle: the page explicitly invites outside writers, so
// offering to write a free article is a genuine, specific pitch rather than
// a generic cold email.
const GUEST_POST_KEYWORDS = [
  'write for us', 'guest post', 'guest author', 'guest blog', 'guest blogging',
  'contribute', 'contributor', 'submit an article', 'submit a post',
  'guidelines', 'become a writer', 'accepting guest posts',
];

// Which angle (if either) a piece of text fits — 'guest-post' takes
// priority when a page matches both, since a real "write for us" page is a
// stronger, more specific reason to reach out than a generic tools list.
function detectPitchReason(text) {
  const lower = String(text ?? '').toLowerCase();
  if (GUEST_POST_KEYWORDS.some((k) => lower.includes(k))) return 'guest-post';
  if (TOOL_KEYWORDS.some((k) => lower.includes(k))) return 'tool';
  return null;
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

// The old "resource page / best free tools" query set, from before this
// scanner was repointed at guest-post targets — used below purely to detect
// whether a saved config is still the untouched old defaults (safe to
// replace) versus something Dean has actually edited (never overwritten).
const OLD_DEFAULT_QUERIES = [
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

function sameQueryList(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((q, i) => q === b[i]);
}

async function ensureBacklinkConfig(db) {
  const ref = db.collection('backlinkConfig').doc('queries');
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ list: DEFAULT_QUERIES });
  } else if (sameQueryList(snap.data().list, OLD_DEFAULT_QUERIES)) {
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
        const reason = detectPitchReason(text);
        if (!reason) continue;

        const domain = domainFrom(item.link);
        if (!domain) continue;

        const id = hashId(domain);
        const ref = db.collection('crmLeads').doc(id);
        const existing = await ref.get();
        if (existing.exists) continue;

        const notes = reason === 'guest-post'
          ? `Found via search: "${q}"\n\nLooks like they accept outside writers — pitch: offer to write a free guest article. Use the "Guest Post Pitch" template.\nPage: ${item.title ?? ''}\n${item.snippet ?? ''}`
          : `Found via search: "${q}"\n\nLooks like a resource/tools list page — pitch: suggest one of your free tools for inclusion. Use the "Backlink Outreach" template.\nPage: ${item.title ?? ''}\n${item.snippet ?? ''}`;

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
          tags: reason === 'guest-post' ? ['Backlink', 'Guest Post'] : ['Backlink', 'Tool Mention'],
          notes,
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
