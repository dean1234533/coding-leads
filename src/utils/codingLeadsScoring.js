/**
 * Coding Leads scoring engine — mirrors functions/codingLeadsService.js so
 * manually-added leads get an instant, explainable score without a round trip
 * to the backend.
 */

export const STATUSES = [
  'New', 'Saved', 'Contacted', 'Replied', 'Follow Up', 'Won', 'Lost', 'Not Relevant',
];

export const LEAD_TYPES = [
  'Website', 'Website Redesign', 'Web Developer', 'App Developer', 'Mobile App',
  'Web App', 'SaaS', 'MVP', 'Booking System', 'Ecommerce', 'Shopify', 'WordPress',
  'SEO Help', 'Technical Fix', 'Other',
];

export const DEFAULT_KEYWORDS = {
  webDev: [
    'need a web developer', 'looking for a web developer', 'website developer needed',
    'need a website designer', 'looking for a website designer', 'need a website for my business',
    'need help with my website', 'website redesign needed', 'website not working on mobile',
    'need a booking system', 'need a landing page', 'need a shopify developer', 'need a wordpress developer',
  ],
  appDev: [
    'need an app developer', 'looking for an app developer', 'app developer needed',
    'mobile app developer needed', 'need someone to build an app', 'need help building an app',
    'need a developer for my app idea', 'ios app developer needed', 'android app developer needed',
    'react native developer needed', 'flutter developer needed',
  ],
  saasMvp: [
    'need an mvp built', 'need a saas developer', 'saas developer needed', 'need a web app built',
    'looking for a developer for my startup', 'need a dashboard built', 'need a booking platform',
    'need a client portal', 'need a marketplace built', 'need a custom crm',
  ],
  location: ['london', 'uk', 'remote', 'local business', 'small business'],
};

export const DEFAULT_SOURCES = [
  { id: 'reddit-forhire',          name: 'r/forhire (Reddit)',          url: 'https://www.reddit.com/r/forhire/new/.rss',          enabled: true  },
  { id: 'reddit-somebodymakethis', name: 'r/SomebodyMakeThis (Reddit)', url: 'https://www.reddit.com/r/SomebodyMakeThis/new/.rss', enabled: true  },
  { id: 'reddit-saas',             name: 'r/SaaS (Reddit)',             url: 'https://www.reddit.com/r/SaaS/new/.rss',             enabled: false },
  { id: 'reddit-webdev',           name: 'r/webdev (Reddit)',           url: 'https://www.reddit.com/r/webdev/new/.rss',           enabled: false },
];

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

export function scoreText(text) {
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

export function scoreUrgency(text) {
  const lower = String(text ?? '').toLowerCase();
  const matched = URGENCY_SIGNALS.filter((s) => lower.includes(s));
  return Math.max(0, Math.min(100, 10 + matched.length * 20));
}

const LEAD_TYPE_RULES = [
  { type: 'Shopify',          keywords: ['shopify'] },
  { type: 'WordPress',        keywords: ['wordpress', 'wp theme', 'wp plugin'] },
  { type: 'Booking System',   keywords: ['booking system', 'booking platform', 'appointment system', 'scheduling app'] },
  { type: 'Ecommerce',        keywords: ['ecommerce', 'e-commerce', 'online store', 'shopping cart'] },
  { type: 'SEO Help',         keywords: ['seo', 'search engine ranking', 'google ranking'] },
  { type: 'Website Redesign', keywords: ['redesign', 'outdated website', 'website feels outdated', 'revamp my site'] },
  { type: 'Technical Fix',    keywords: ['not working', 'broken', 'bug fix', 'website down', 'technical fix', 'website issue'] },
  { type: 'MVP',              keywords: ['mvp', 'minimum viable product'] },
  { type: 'SaaS',             keywords: ['saas', 'software as a service'] },
  { type: 'Mobile App',       keywords: ['ios app', 'android app', 'mobile app', 'react native', 'flutter'] },
  { type: 'App Developer',    keywords: ['app developer', 'app idea', 'build an app', 'building an app'] },
  { type: 'Web App',          keywords: ['web app', 'dashboard built', 'client portal', 'web application'] },
  { type: 'Web Developer',    keywords: ['web developer', 'website developer'] },
  { type: 'Website',          keywords: ['website designer', 'landing page', 'need a website', 'website for my business'] },
];

export function detectLeadType(text) {
  const lower = String(text ?? '').toLowerCase();
  for (const rule of LEAD_TYPE_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) return rule.type;
  }
  return 'Other';
}

export function detectLocation(text, locationKeywords = DEFAULT_KEYWORDS.location) {
  const lower = String(text ?? '').toLowerCase();
  const hit = locationKeywords.find((k) => lower.includes(String(k).toLowerCase()));
  return hit ? hit.replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

export function detectBudget(text) {
  const str = String(text ?? '');
  const symbolMatch = str.match(/[$£€]\s?\d[\d,]*(\.\d+)?(\s?-\s?[$£€]?\s?\d[\d,]*(\.\d+)?)?/);
  if (symbolMatch) return symbolMatch[0].trim();
  const wordMatch = str.match(/budget[^.\n]{0,40}/i);
  return wordMatch ? wordMatch[0].trim() : '';
}

const WEBSITE_TYPES  = ['Website', 'WordPress', 'Shopify', 'Ecommerce', 'SEO Help', 'Technical Fix', 'Web Developer'];
const REDESIGN_TYPES = ['Website Redesign'];

const WEBSITE_MSG  = "Hi, I saw your post about needing help with a website. I'm Dean from dean-da-dev and I build premium, mobile-friendly websites for local businesses. I'd be happy to take a look and suggest a few options.";
const APP_MSG       = "Hi, I saw your post about needing an app developer. I'm Dean from dean-da-dev and I build modern web/app projects, MVPs, dashboards, and booking systems. I'd be happy to hear more about what you're trying to build.";
const REDESIGN_MSG  = "Hi, I saw you mentioned your website needs improving. I'm Dean from dean-da-dev and I help businesses redesign outdated websites so they look more professional, work better on mobile, and generate more enquiries.";

export function generateOutreachMessage(leadType) {
  if (REDESIGN_TYPES.includes(leadType)) return REDESIGN_MSG;
  if (WEBSITE_TYPES.includes(leadType))  return WEBSITE_MSG;
  return APP_MSG;
}

/**
 * Runs the full scoring pipeline against a manually-entered lead's text and
 * returns everything needed to populate a lead document.
 */
export function analyzeLeadText({ title = '', snippet = '', leadTypeOverride, locationKeywords }) {
  const text = `${title} ${snippet}`;
  const { intentScore, matchedHigh, matchedMedium, reasons } = scoreText(text);
  const leadType = leadTypeOverride || detectLeadType(text);
  return {
    intentScore,
    urgencyScore: scoreUrgency(text),
    leadType,
    location: detectLocation(text, locationKeywords),
    budget: detectBudget(text),
    detectedKeywords: [...matchedHigh, ...matchedMedium],
    scoreReasons: reasons,
    suggestedOutreach: generateOutreachMessage(leadType),
  };
}
