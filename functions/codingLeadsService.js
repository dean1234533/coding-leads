'use strict';

const Parser = require('rss-parser');
const axios = require('axios');
const { analyzeLeadIntent } = require('./localIntentAnalyzer');

// Passed as target_service_keywords to the Local Intent Intelligence Engine
// prompt — this business's actual services, not a generic local-trades list.
const TARGET_SERVICE_KEYWORDS = 'web design, web development, app development, booking/scheduling systems, SaaS/MVP development';

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

// Reddit's search.rss endpoint searches EVERY subreddit at once, not just one —
// this is a much bigger lever than adding curated subreddits one at a time,
// since a post asking for a developer could land in any of thousands of subs
// (r/smallbusiness, a local city sub, r/Entrepreneur, etc.), not just the
// handful anyone would think to hand-pick.
//
// Nextdoor was investigated and ruled out: it does have a real public
// search API (content_api/v2/search_post), but their own application form
// explicitly states "We do not approve exploration, research, AI training,
// lead-generation, or marketing-agency dashboards" — which is exactly what
// this is, so applying would either be rejected or misrepresent the use
// case. Not worth pursuing unless their policy changes.
const DEFAULT_SOURCES = [
  { id: 'reddit-search-webdev',     name: 'Reddit search: web/website developer', url: 'https://www.reddit.com/search.rss?q=%22need+a+web+developer%22+OR+%22looking+for+a+web+developer%22+OR+%22need+a+website+designer%22+OR+%22need+a+website+for+my+business%22+OR+%22website+developer+needed%22&sort=new', enabled: true },
  { id: 'reddit-search-appdev',     name: 'Reddit search: app developer',         url: 'https://www.reddit.com/search.rss?q=%22need+an+app+developer%22+OR+%22looking+for+an+app+developer%22+OR+%22need+someone+to+build+an+app%22+OR+%22app+developer+needed%22&sort=new', enabled: true },
  { id: 'reddit-search-general',    name: 'Reddit search: developer/dev help',    url: 'https://www.reddit.com/search.rss?q=%22need+a+developer%22+OR+%22hire+a+developer%22+OR+%22recommend+a+developer%22+OR+%22know+a+good+developer%22&sort=new', enabled: true },
  { id: 'reddit-search-mvp',        name: 'Reddit search: MVP/SaaS/dashboard',    url: 'https://www.reddit.com/search.rss?q=%22need+an+mvp+built%22+OR+%22looking+for+a+developer+for+my+startup%22+OR+%22need+a+dashboard+built%22+OR+%22need+a+booking+system%22&sort=new', enabled: true },
  { id: 'reddit-forhire',           name: 'r/forhire (Reddit)',           url: 'https://www.reddit.com/r/forhire/new/.rss',           enabled: true  },
  { id: 'reddit-somebodymakethis',  name: 'r/SomebodyMakeThis (Reddit)',  url: 'https://www.reddit.com/r/SomebodyMakeThis/new/.rss',  enabled: true  },
  { id: 'reddit-slavelabour',       name: 'r/slavelabour (Reddit)',       url: 'https://www.reddit.com/r/slavelabour/new/.rss',       enabled: true  },
  { id: 'reddit-donedirtcheap',     name: 'r/DoneDirtCheap (Reddit)',     url: 'https://www.reddit.com/r/DoneDirtCheap/new/.rss',     enabled: true  },
  { id: 'reddit-smallbusiness',     name: 'r/smallbusiness (Reddit)',     url: 'https://www.reddit.com/r/smallbusiness/new/.rss',     enabled: true  },
  { id: 'reddit-entrepreneur',      name: 'r/Entrepreneur (Reddit)',      url: 'https://www.reddit.com/r/Entrepreneur/new/.rss',      enabled: true  },
  { id: 'reddit-freelance',         name: 'r/freelance (Reddit)',         url: 'https://www.reddit.com/r/freelance/new/.rss',         enabled: false },
  { id: 'reddit-saas',              name: 'r/SaaS (Reddit)',              url: 'https://www.reddit.com/r/SaaS/new/.rss',              enabled: false },
  { id: 'reddit-webdev',            name: 'r/webdev (Reddit)',            url: 'https://www.reddit.com/r/webdev/new/.rss',            enabled: false },
  // Reddit's own RSS only covers Reddit — a Google-search-backed source (via
  // SerpApi, already used elsewhere in this app) catches the same kind of
  // "need a developer" post on Facebook Groups, Twitter/X, forums, and
  // anywhere else Google indexes, which is a real gap: a live test turned up
  // fresh (1-3 days old) Facebook Group posts with exactly this intent that
  // Reddit's RSS has no way to ever see. `-site:reddit.com` avoids spending
  // quota on results the RSS sources above already cover. SerpApi's free
  // tier is only 250 searches/month, shared with the weekly backlink
  // scanner and the Instagram-search fallback, so these run at most once a
  // day regardless of how often the overall scan fires (see
  // shouldRunSerpApiSources below) — two queries/day is ~60/month, leaving
  // real headroom for everything else sharing the same key.
  {
    id: 'serpapi-webdev',
    name: 'Google search (SerpApi): web/website developer wanted',
    type: 'serpapi',
    query: '"need a web developer" OR "looking for a web developer" OR "need a website designer" OR "need a website for my business" OR "website developer needed" -site:reddit.com',
    enabled: true,
  },
  {
    id: 'serpapi-appdev',
    name: 'Google search (SerpApi): app/MVP developer wanted',
    type: 'serpapi',
    query: '"need an app developer" OR "looking for an app developer" OR "need an mvp built" OR "looking for a developer for my startup" -site:reddit.com',
    enabled: true,
  },
  // Bluesky's public AppView (public.api.bsky.app) is genuinely open — no
  // login, no API key, no approval process, unlike every other platform
  // investigated this session. Two separate queries since Bluesky search
  // doesn't support OR groups the way Reddit/Google do.
  {
    id: 'bluesky-webdev',
    name: 'Bluesky search: web/website developer wanted',
    type: 'bluesky',
    query: '"need a web developer" OR "looking for a web developer" OR "need a website" OR "website developer needed"',
    enabled: true,
  },
  {
    id: 'bluesky-appdev',
    name: 'Bluesky search: app/MVP developer wanted',
    type: 'bluesky',
    query: '"need an app developer" OR "looking for an app developer" OR "need an mvp built"',
    enabled: true,
  },
];

// ─── Scoring signals ──────────────────────────────────────────────────────────

const HIGH_SIGNALS = [
  'need', 'looking for', 'developer needed', 'paid', 'budget', 'asap', 'urgent',
  'quote', 'hire', 'ready to start', 'this week', 'this month', 'mvp', 'launch',
  'recommend', 'anyone know', 'can anyone', 'who can', 'willing to pay', 'compensate',
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

  if (!sourcesSnap.exists) {
    await sourcesRef.set({ list: DEFAULT_SOURCES });
  } else {
    // Newly-added default sources (like the ones above) wouldn't otherwise
    // reach a config doc that already exists — merge in any missing by id,
    // leaving already-configured sources (and their enabled/disabled state
    // as toggled in the UI) untouched.
    const existingList = sourcesSnap.data().list ?? [];
    const existingIds = new Set(existingList.map((s) => s.id));
    const missing = DEFAULT_SOURCES.filter((s) => !existingIds.has(s.id));
    if (missing.length > 0) {
      await sourcesRef.update({ list: [...existingList, ...missing] });
    }
  }
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
  'web design', 'web designer', 'site built', 'build me', 'build my', 'build a',
  'automation', 'script', 'api integration', 'database', 'no-code', 'low-code',
  'automate', 'tech help', 'technical help', 'app idea', 'freelance developer',
  'freelance web', 'online presence', 'digital presence', 'my business online',
  'my shop online', 'get online',
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

const MIN_SCORE_TO_KEEP = 18;
const NOTIFY_SCORE_THRESHOLD = 60;

// aiKeys is optional — { gemini, groq, mistral, openrouter, cerebras,
// cloudflare, huggingface }, same shape used elsewhere in this app. Falsy
// (not passed, or every key missing) means the AI layer is skipped
// entirely and every candidate falls back to the keyword scorer.
async function runScan(db, FieldValue, aiKeys) {
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

  // Normalizes a SerpApi Google-search response into the same {title, link,
  // contentSnippet, author} shape rss-parser gives feed.items, so everything
  // downstream (topical filter, scoring, dedup, save) treats it identically
  // to a Reddit RSS item. tbs=qdr:d (past day) keeps results fresh since
  // this only runs once/day (see shouldRunSerpApiSources).
  async function fetchSerpApiItems(query, apiKey) {
    const { data } = await axios.get('https://serpapi.com/search.json', {
      params: { engine: 'google', q: query, tbs: 'qdr:d', num: 20, api_key: apiKey },
      timeout: 15000,
    });
    return (data.organic_results ?? []).map((r) => ({
      title: r.title ?? '',
      link: r.link ?? '',
      contentSnippet: r.snippet ?? '',
      author: null,
    }));
  }

  // Bluesky's public AppView needs no auth at all — no API key, no login,
  // no approval process (unlike every other platform investigated this
  // session). sort=latest keeps results fresh since new posts matter far
  // more here than popular ones.
  //
  // Normalizes into the same {title, link, contentSnippet, author} shape as
  // every other source. author is deliberately left null (like the SerpApi
  // source) rather than the poster's handle — the downstream contactLink
  // logic assumes a non-null author is a Reddit username and builds a
  // reddit.com message link from it, which would silently produce a
  // broken/wrong URL here. The post's own bsky.app URL (item.link) is the
  // only usable contact route anyway.
  async function fetchBlueskyItems(query) {
    const { data } = await axios.get('https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts', {
      params: { q: query, sort: 'latest', limit: 25 },
      timeout: 15000,
    });
    return (data.posts ?? []).map((p) => {
      const rkey = String(p.uri ?? '').split('/').pop();
      const text = p.record?.text ?? '';
      return {
        title: text.slice(0, 80),
        link: p.author?.handle && rkey ? `https://bsky.app/profile/${p.author.handle}/post/${rkey}` : '',
        contentSnippet: text,
        author: null,
      };
    });
  }

  // SerpApi's free tier is 250 searches/month total, shared with the weekly
  // backlink scanner and the Instagram-search fallback used elsewhere in
  // this app — the coding-leads scan itself runs every 2 hours, far too
  // often to let SerpApi sources fire on every tick. This caps them to
  // roughly once/day by checking (and stamping) a shared Firestore doc,
  // independent of the RSS sources' cadence.
  async function shouldRunSerpApiSources() {
    const ref = db.collection('codingLeadsConfig').doc('serpApiState');
    const snap = await ref.get();
    const lastRunAt = snap.exists ? snap.data()?.lastRunAt?.toDate?.() : null;
    const hoursSince = lastRunAt ? (Date.now() - lastRunAt.getTime()) / 3_600_000 : Infinity;
    if (hoursSince < 20) return false; // some slack under 24h given the 2h-tick schedule
    await ref.set({ lastRunAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  }

  let scanned = 0;
  let added   = 0;
  const perSource = [];
  const newHighScoreLeads = [];
  const enabledSources = sources.filter((s) => s.enabled);
  let serpApiAllowedThisRun = null; // resolved lazily, shared across all serpapi-type sources in this run

  for (let srcIndex = 0; srcIndex < enabledSources.length; srcIndex++) {
    const src = enabledSources[srcIndex];
    // Space out requests to the same platform (e.g. Reddit) so we don't trip
    // its per-IP rate limit by hitting several feeds back-to-back.
    if (srcIndex > 0) await new Promise((resolve) => setTimeout(resolve, 3000));

    if (src.type === 'serpapi') {
      const apiKey = process.env.SERPAPI_KEY;
      if (!apiKey) { perSource.push({ source: src.name, error: 'SERPAPI_KEY not set' }); continue; }
      if (serpApiAllowedThisRun === null) serpApiAllowedThisRun = await shouldRunSerpApiSources();
      if (!serpApiAllowedThisRun) {
        perSource.push({ source: src.name, skipped: 'throttled — SerpApi sources run at most once/day to stay within the shared free monthly quota' });
        continue;
      }
    }

    try {
      let feedItems;
      if (src.type === 'serpapi') {
        feedItems = await fetchSerpApiItems(src.query, process.env.SERPAPI_KEY);
      } else if (src.type === 'bluesky') {
        feedItems = await fetchBlueskyItems(src.query);
      } else {
        feedItems = (await fetchFeed(src.url)).items ?? [];
      }
      let addedForSrc = 0;

      for (const item of feedItems) {
        scanned++;
        const title = item.title ?? '';
        if (titleStartsWithFlair(title, FREELANCER_SELF_PROMO_PATTERN)) continue; // freelancer ad, not a lead

        const text = `${title} ${item.contentSnippet ?? item.content ?? ''}`;
        if (!hasTopicalRelevance(text)) continue; // not about dev/website/app work at all — free filter, keeps AI calls for plausible candidates only

        // Dedup before spending an AI call, not after — re-analyzing a post
        // already seen on a previous scan would waste free-tier AI quota
        // for nothing (this collection's write is a no-op either way).
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

        // The real judgment call: does this post actually represent someone
        // trying to hire (not a freelancer's own self-promo mixed into a
        // thread, not an unrelated service, not spam) — replaces the old
        // keyword-scoring pass for anything that reaches this point. Falls
        // back to the keyword scorer only if every AI provider is down, so
        // a bad night for free-tier AI quota doesn't stop the scan finding
        // leads entirely, just makes it less precise for that run.
        const analysis = aiKeys ? await analyzeLeadIntent({
          sourcePlatform: src.name,
          threadTitle: title,
          threadBody: item.contentSnippet ?? item.content ?? '',
          comments: '',
          authorName: item.author ?? '',
          authorLocation: '',
          threadUrl: item.link ?? '',
          timestamp: item.isoDate ?? item.pubDate ?? '',
          targetServiceKeywords: TARGET_SERVICE_KEYWORDS,
        }, aiKeys) : null;

        let intentScore, leadType, location, budget, suggestedOutreach, scoreReasons, extra;
        if (analysis) {
          if (analysis.crm_action === 'IGNORE') continue;
          intentScore = Math.max(0, Math.min(100, analysis.intent_score ?? 0));
          leadType = detectLeadType(text); // still used to pick which outreach template style fits, kept alongside the AI's freeform service_needed
          location = analysis.location || detectLocation(text, keywords.location);
          budget = analysis.budget_mentioned ? (detectBudget(text) || 'Mentioned — see reasoning') : '';
          suggestedOutreach = analysis.suggested_reply || generateOutreachMessage(leadType);
          scoreReasons = analysis.reasoning ?? [];
          extra = {
            aiAnalyzed: true,
            serviceNeeded: analysis.service_needed ?? null,
            summary: analysis.summary ?? null,
            urgency: analysis.urgency ?? null,
            budgetMentioned: Boolean(analysis.budget_mentioned),
            competitorMentioned: Boolean(analysis.competitor_mentioned),
            decisionMaker: Boolean(analysis.decision_maker),
            contactSignal: Boolean(analysis.contact_signal),
            crmAction: analysis.crm_action,
          };
        } else {
          // Fallback path — same keyword scoring this whole pipeline used
          // before the AI layer existed.
          let scored = scoreText(text);
          intentScore = scored.intentScore;
          scoreReasons = scored.reasons;
          if (titleStartsWithFlair(title, BUYER_INTENT_FLAIR_PATTERN)) {
            intentScore = Math.min(100, intentScore + 15);
            scoreReasons = [...scoreReasons, 'Post flaired as "Hiring"/"Task" — explicit buyer intent (+15)'];
          }
          if (intentScore < MIN_SCORE_TO_KEEP) continue;
          leadType = detectLeadType(text);
          location = detectLocation(text, keywords.location);
          budget = detectBudget(text);
          suggestedOutreach = generateOutreachMessage(leadType);
          extra = { aiAnalyzed: false, detectedKeywords: [...scored.matchedHigh, ...scored.matchedMedium] };
        }

        await ref.set({
          title:             item.title ?? 'Untitled post',
          source:            src.name,
          url:               item.link ?? '',
          snippet:           (item.contentSnippet ?? '').slice(0, 500),
          leadType,
          intentScore,
          urgencyScore:      scoreUrgency(text),
          location,
          budget,
          status:            'New',
          notes:             '',
          contactLink,
          scoreReasons,
          suggestedOutreach,
          manual:            false,
          ...extra,
          createdAt:         FieldValue.serverTimestamp(),
          updatedAt:         FieldValue.serverTimestamp(),
        });
        added++;
        addedForSrc++;
        if (intentScore >= NOTIFY_SCORE_THRESHOLD) {
          newHighScoreLeads.push({ title: item.title ?? 'Untitled post', source: src.name, url: item.link ?? '', intentScore, leadType });
        }
      }
      perSource.push({ source: src.name, found: feedItems.length, added: addedForSrc });
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
