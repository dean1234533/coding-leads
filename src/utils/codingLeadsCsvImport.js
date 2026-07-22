import { analyzeLeadText } from './codingLeadsScoring';

// Same hashing scheme as functions/codingLeadsService.js's hashId — used so
// re-importing the same CSV (e.g. a periodically re-exported lead list)
// overwrites the same doc instead of creating duplicates every time.
export function hashId(str) {
  let hash = 0;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return `csv-${hash.toString(36)}`;
}

// Handles quoted fields containing commas/newlines — a plain split(',') would
// break on any pasted CSV that has a comma inside a snippet/description,
// which is the common case here (the whole point of importing is pasting
// real lead text).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// Accepts a handful of likely header spellings so a lead list exported from
// somewhere else (a spreadsheet, another CRM's export) doesn't need to be
// reformatted by hand first — matches whichever of these columns exist.
const FIELD_ALIASES = {
  title:       ['title', 'name', 'subject', 'lead', 'headline'],
  source:      ['source', 'platform', 'origin'],
  url:         ['url', 'link', 'post url', 'post link'],
  location:    ['location', 'city', 'area'],
  budget:      ['budget', 'price', 'quote'],
  snippet:     ['snippet', 'description', 'notes', 'message', 'details', 'body'],
  contactLink: ['contactlink', 'contact', 'contact link', 'email', 'phone'],
  leadType:    ['leadtype', 'lead type', 'type', 'service'],
};

function pick(row, aliases) {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== '') return row[alias];
  }
  return '';
}

/**
 * Converts one parsed CSV row into a full lead document, running it through
 * the same client-side scoring manually-added leads get (see
 * CodingLeadAddForm.jsx) so imported leads aren't left unscored.
 */
export function csvRowToLead(row, locationKeywords) {
  const title = pick(row, FIELD_ALIASES.title);
  if (!title) return null;

  const snippet = pick(row, FIELD_ALIASES.snippet);
  const explicitLeadType = pick(row, FIELD_ALIASES.leadType);
  const analysis = analyzeLeadText({ title, snippet, leadTypeOverride: explicitLeadType || undefined, locationKeywords });

  const url = pick(row, FIELD_ALIASES.url);
  return {
    id: hashId(url || title),
    title,
    source: pick(row, FIELD_ALIASES.source) || 'CSV Import',
    url,
    contactLink: pick(row, FIELD_ALIASES.contactLink),
    snippet,
    leadType: analysis.leadType,
    location: pick(row, FIELD_ALIASES.location) || analysis.location,
    budget: pick(row, FIELD_ALIASES.budget) || analysis.budget,
    intentScore: analysis.intentScore,
    urgencyScore: analysis.urgencyScore,
    detectedKeywords: analysis.detectedKeywords,
    scoreReasons: analysis.scoreReasons,
    suggestedOutreach: analysis.suggestedOutreach,
    status: 'New',
    manual: true,
    imported: true,
  };
}
