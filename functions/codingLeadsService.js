'use strict';

const Parser = require('rss-parser');

// ─── Default config (seeded into Firestore on first run, editable after) ─────

const DEFAULT_KEYWORDS = {
  webDev: [
    'need a web developer',
    'looking for a web developer',
    'website developer needed',
    'need a website designer',
    'looking for a website designer',
    'need a website for my business',
    'need help with my website',
    'website redesign needed',
    'website not working on mobile',
    'need a booking system',
    'need a landing page',
    'need a shopify developer',
    'need a wordpress developer',
  ],
  appDev: [
    'need an app developer',
    'looking for an app developer',
    'app developer needed',
    'mobile app developer needed',
    'need someone to build an app',
    'need help building an app',
    'need a developer for my app idea',
    'ios app developer needed',
    'android app developer needed',
    'react native developer needed',
    'flutter developer needed',
  ],
  saasMvp: [
    'need an mvp built',
    'need a saas developer',
    'saas developer needed',
    'need a web app built',
    'looking for a developer for my startup',
    'need a dashboard built',
    'need a booking platform',
    'need a client portal',
    'need a marketplace built',
    'need a custom crm',
  ],
  location: ['london', 'uk', 'remote', 'local business', 'small business'],
};

const DEFAULT_SOURCES = [
  { id: 'reddit-forhire',           name: 'r/forhire (Reddit)',           url: 'https://www.reddit.com/r/forhire/new/.rss',           enabled: true  },
  { id: 'reddit-somebodymakethis',  name: 'r/SomebodyMakeThis (Reddit)',  url: 'https://www.reddit.com/r/SomebodyMakeThis/new/.rss',  enabled: true  },
  { id: 'reddit-saas',              name: 'r/SaaS (Reddit)',              url: 'https://www.reddit.com/r/SaaS/new/.rss',              enabled: false },
  { id: 'reddit-webdev',            name: 'r/webdev (Reddit)',            url: 'https://www.reddit.com/r/webdev/new/.rss',            enabled: false },
];

// ─── Scoring signals ──────────────────────────────────────────────────────────

const HIGH_SIGNALS = [
  'need', 'looking for', 'developer needed', 'paid', 'budget', 'asap', 'urgent',
  'quote', 'hire', 'ready to start', 'this week', 'this month', 'mvp', 'launch',
];

const MEDIUM_SIGNALS = [
  'thinking about', 'recommendations', 'advice', 'how much does it cost',
  'website feels outdated', 'need help choosing',
];

const LOW_SIGNALS = [
  'learning to code', 'student project', 'free work only', 'spam',
  'hiring employees', 'irrelevant tech discussion',
];

const URGENCY_SIGNALS = [
  'asap', 'urgent', 'this week', 'this month', 'ready to start',
  'deadline', 'immediately', 'right away',
];

function scoreText(text) {
  const lower = String(text ?? '').toLowerCase();
  const matchedHigh   = HIGH_SIGNALS.filter((s) => lower.includes(s));
  const matchedMedium = MEDIUM_SIGNALS.filter((s) => lower.includes(s));
  const matchedLow    = LOW_SIGNALS.filter((s) => lower.includes(s));

  let intentScore = 15;
  intentScore += matchedHigh.length * 14;
  intentScore += matchedMedium.length * 6;
  intentScore -= matchedLow.length * 40;
  intentScore = Math.max(0, Math.min(100, intentScore));

  const reasons = [];
  if (matchedHigh.length)   reasons.push(`High-intent phrases found: ${matchedHigh.join(', ')}`);
  if (matchedMedium.length) reasons.push(`Medium-intent phrases found: ${matchedMedium.join(', ')}`);
  if (matchedLow.length)    reasons.push(`Low-relevance phrases found: ${matchedLow.join(', ')} (score reduced)`);
  if (!matchedHigh.length && !matchedMedium.length && !matchedLow.length) {
    reasons.push('No strong signals detected — base score only.');
  }

  return { intentScore, matchedHigh, matchedMedium, matchedLow, reasons };
}

function scoreUrgency(text) {
  const lower = String(text ?? '').toLowerCase();
  const matched = URGENCY_SIGNALS.filter((s) => lower.includes(s));
  let urgencyScore = 10 + matched.length * 20;
  return Math.max(0, Math.min(100, urgencyScore));
}

// ─── Lead type detection (first match wins) ──────────────────────────────────

const LEAD_TYPE_RULES = [
  { type: 'Shopify',           keywords: ['shopify'] },
  { type: 'WordPress',         keywords: ['wordpress', 'wp theme', 'wp plugin'] },
  { type: 'Booking System',    keywords: ['booking system', 'booking platform', 'appointment system', 'scheduling app'] },
  { type: 'Ecommerce',         keywords: ['ecommerce', 'e-commerce', 'online store', 'shopping cart'] },
  { type: 'SEO Help',          keywords: ['seo', 'search engine ranking', 'google ranking'] },
  { type: 'Website Redesign',  keywords: ['redesign', 'outdated website', 'website feels outdated', 'revamp my site'] },
  { type: 'Technical Fix',     keywords: ['not working', 'broken', 'bug fix', 'website down', 'technical fix', 'website issue'] },
  { type: 'MVP',               keywords: ['mvp', 'minimum viable product'] },
  { type: 'SaaS',              keywords: ['saas', 'software as a service'] },
  { type: 'Mobile App',        keywords: ['ios app', 'android app', 'mobile app', 'react native', 'flutter'] },
  { type: 'App Developer',     keywords: ['app developer', 'app idea', 'build an app', 'building an app'] },
  { type: 'Web App',           keywords: ['web app', 'dashboard built', 'client portal', 'web application'] },
  { type: 'Web Developer',     keywords: ['web developer', 'website developer'] },
  { type: 'Website',           keywords: ['website designer', 'landing page', 'need a website', 'website for my business'] },
];

function detectLeadType(text) {
  const lower = String(text ?? '').toLowerCase();
  for (const rule of LEAD_TYPE_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) return rule.type;
  }
  return 'Other';
}

function detectLocation(text, locationKeywords) {
  const lower = String(text ?? '').toLowerCase();
  const list = Array.isArray(locationKeywords) ? locationKeywords : DEFAULT_KEYWORDS.location;
  const hit = list.find((k) => lower.includes(String(k).toLowerCase()));
  return hit ? hit.replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

function detectBudget(text) {
  const str = String(text ?? '');
  const symbolMatch = str.match(/[$£€]\s?\d[\d,]*(\.\d+)?(\s?-\s?[$£€]?\s?\d[\d,]*(\.\d+)?)?/);
  if (symbolMatch) return symbolMatch[0].trim();
  const wordMatch = str.match(/budget[^.\n]{0,40}/i);
  return wordMatch ? wordMatch[0].trim() : '';
}

// ─── Outreach message templates ──────────────────────────────────────────────

const WEBSITE_TYPES  = ['Website', 'WordPress', 'Shopify', 'Ecommerce', 'SEO Help', 'Technical Fix', 'Web Developer'];
const REDESIGN_TYPES = ['Website Redesign'];

const WEBSITE_MSG  = "Hi, I saw your post about needing help with a website. I'm Dean from dean-da-dev and I build premium, mobile-friendly websites for local businesses. I'd be happy to take a look and suggest a few options.";
const APP_MSG       = "Hi, I saw your post about needing an app developer. I'm Dean from dean-da-dev and I build modern web/app projects, MVPs, dashboards, and booking systems. I'd be happy to hear more about what you're trying to build.";
const REDESIGN_MSG  = "Hi, I saw you mentioned your website needs improving. I'm Dean from dean-da-dev and I help businesses redesign outdated websites so they look more professional, work better on mobile, and generate more enquiries.";

function generateOutreachMessage(leadType) {
  if (REDESIGN_TYPES.includes(leadType)) return REDESIGN_MSG;
  if (WEBSITE_TYPES.includes(leadType))  return WEBSITE_MSG;
  return APP_MSG;
}

// ─── Firestore config helpers ─────────────────────────────────────────────────

async function ensureConfigDocs(db) {
  const keywordsRef = db.collection('codingLeadsConfig').doc('keywords');
  const sourcesRef  = db.collection('codingLeadsConfig').doc('sources');
  const [keywordsSnap, sourcesSnap] = await Promise.all([keywordsRef.get(), sourcesRef.get()]);
  if (!keywordsSnap.exists) await keywordsRef.set(DEFAULT_KEYWORDS);
  if (!sourcesSnap.exists)  await sourcesRef.set({ list: DEFAULT_SOURCES });
}

// Reddit "for hire" boards use title flairs to mean opposite things:
// "[Hiring]"/"[Task]" = someone wants to hire a developer (what we want).
// "[For Hire]" = a freelancer advertising their own services (noise — a competitor, not a lead).
// Checked against the first ~30 chars of the title rather than a strict anchor —
// some posts have a stray "Title: " (or similar) prefix before the actual flair.
const FREELANCER_SELF_PROMO_PATTERN = /\[?\s*for[\s-]?hire\s*\]?/i;
const BUYER_INTENT_FLAIR_PATTERN    = /\[?\s*(hiring|task)\s*\]?/i;
const FLAIR_WINDOW = 30;

function titleStartsWithFlair(title, pattern) {
  return pattern.test(String(title ?? '').slice(0, FLAIR_WINDOW));
}

// A post must mention something dev/website/app-shaped to count as a coding lead at all —
// otherwise generic words like "need", "hire", "paid" match totally unrelated gigs
// (tutoring, acting, virtual assistants, art commissions).
const TOPIC_KEYWORDS = [
  ...new Set(LEAD_TYPE_RULES.flatMap((r) => r.keywords)),
  'developer', 'programmer', 'coder', 'coding', 'software', 'website', 'web app',
  'build me', 'build my', 'build a', 'automation', 'script', 'api integration',
  'database', 'no-code', 'low-code', 'automate', 'tech help', 'technical help', 'app idea',
];

function hasTopicalRelevance(text) {
  const lower = String(text ?? '').toLowerCase();
  return TOPIC_KEYWORDS.some((k) => lower.includes(k));
}

function hashId(str) {
  let hash = 0;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return `auto_${hash.toString(36)}`;
}

// ─── RSS scan ─────────────────────────────────────────────────────────────────

const MIN_SCORE_TO_KEEP = 25;
const NOTIFY_SCORE_THRESHOLD = 60;

async function runScan(db, FieldValue) {
  const [keywordsSnap, sourcesSnap] = await Promise.all([
    db.collection('codingLeadsConfig').doc('keywords').get(),
    db.collection('codingLeadsConfig').doc('sources').get(),
  ]);
  const keywords = keywordsSnap.exists ? keywordsSnap.data() : DEFAULT_KEYWORDS;
  const sources  = sourcesSnap.exists ? (sourcesSnap.data().list ?? DEFAULT_SOURCES) : DEFAULT_SOURCES;

  const parser = new Parser({
    timeout: 15000,
    headers: { 'User-Agent': 'coding-leads-tracker/1.0 (personal use, RSS reader)' },
  });

  // Some platforms (Reddit especially) rate-limit datacenter IPs inconsistently —
  // a single retry after a short backoff clears most transient 429s.
  async function fetchFeed(url) {
    try {
      return await parser.parseURL(url);
    } catch (err) {
      if (/429/.test(err.message)) {
        await new Promise((resolve) => setTimeout(resolve, 6000));
        return parser.parseURL(url);
      }
      throw err;
    }
  }

  let scanned = 0;
  let added   = 0;
  const perSource = [];
  const newHighScoreLeads = [];
  const enabledSources = sources.filter((s) => s.enabled);

  for (let srcIndex = 0; srcIndex < enabledSources.length; srcIndex++) {
    const src = enabledSources[srcIndex];
    // Space out requests to the same platform (e.g. Reddit) so we don't trip
    // its per-IP rate limit by hitting several feeds back-to-back.
    if (srcIndex > 0) await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      const feed = await fetchFeed(src.url);
      let addedForSrc = 0;

      for (const item of feed.items ?? []) {
        scanned++;
        const title = item.title ?? '';
        if (titleStartsWithFlair(title, FREELANCER_SELF_PROMO_PATTERN)) continue; // freelancer ad, not a lead

        const text = `${title} ${item.contentSnippet ?? item.content ?? ''}`;
        if (!hasTopicalRelevance(text)) continue; // not about dev/website/app work at all

        let { intentScore, reasons: scoreReasons, matchedHigh, matchedMedium } = scoreText(text);
        if (titleStartsWithFlair(title, BUYER_INTENT_FLAIR_PATTERN)) {
          intentScore = Math.min(100, intentScore + 15);
          scoreReasons = [...scoreReasons, 'Post flaired as "Hiring"/"Task" — explicit buyer intent (+15)'];
        }
        if (intentScore < MIN_SCORE_TO_KEEP) continue;

        const id  = hashId(item.link ?? item.guid ?? item.title);
        const ref = db.collection('codingLeads').doc(id);
        const existing = await ref.get();

        const username  = String(item.author ?? '').replace(/^\/?u\//, '').trim();
        const contactLink = username
          ? `https://www.reddit.com/message/compose/?to=${encodeURIComponent(username)}`
          : (item.link ?? '');

        if (existing.exists) {
          // The post is still fresh enough to be in the feed — patch in a
          // proper message link if this lead was saved before we could derive one.
          const existingData = existing.data();
          if (contactLink && contactLink !== existingData.url && (!existingData.contactLink || existingData.contactLink === existingData.url)) {
            await ref.update({ contactLink, updatedAt: FieldValue.serverTimestamp() });
          }
          continue;
        }

        const leadType = detectLeadType(text);
        await ref.set({
          title:             item.title ?? 'Untitled post',
          source:            src.name,
          url:               item.link ?? '',
          snippet:           (item.contentSnippet ?? '').slice(0, 500),
          leadType,
          intentScore,
          urgencyScore:      scoreUrgency(text),
          location:          detectLocation(text, keywords.location),
          budget:            detectBudget(text),
          status:            'New',
          notes:             '',
          contactLink,
          detectedKeywords:  [...matchedHigh, ...matchedMedium],
          scoreReasons,
          suggestedOutreach: generateOutreachMessage(leadType),
          manual:            false,
          createdAt:         FieldValue.serverTimestamp(),
          updatedAt:         FieldValue.serverTimestamp(),
        });
        added++;
        addedForSrc++;
        if (intentScore >= NOTIFY_SCORE_THRESHOLD) {
          newHighScoreLeads.push({ title: item.title ?? 'Untitled post', source: src.name, url: item.link ?? '', intentScore, leadType });
        }
      }
      perSource.push({ source: src.name, found: feed.items?.length ?? 0, added: addedForSrc });
    } catch (err) {
      perSource.push({ source: src.name, error: err.message });
    }
  }

  return { scanned, added, perSource, newHighScoreLeads };
}

module.exports = {
  DEFAULT_KEYWORDS,
  DEFAULT_SOURCES,
  scoreText,
  scoreUrgency,
  detectLeadType,
  detectLocation,
  detectBudget,
  generateOutreachMessage,
  ensureConfigDocs,
  runScan,
};
