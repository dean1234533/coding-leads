'use strict';

const axios = require('axios');

// The real, flagship Growth Audit product (a separate Cloudflare Worker app,
// not part of this codebase) — this is the single source of truth for
// findings used in outreach. It's a public, anonymous, unauthenticated
// endpoint (no API key needed) that does real browser rendering, real
// PageSpeed measurement, and returns structured checks per category, each
// with a passed/severity/weight/measurementType/status. This function
// itself is only ever called manually/on-demand (runGrowthAuditForLead) —
// never from a scheduled or bulk job, since every call here spends real
// budget on shared Cloudflare infrastructure this app doesn't own or
// control. The scheduled auto-audit-email job (crmGmailService.js) only
// drafts for leads that already have findings stored from a prior manual
// run; it never triggers a fresh scan itself.
const GROWTH_AUDIT_URL = 'https://app.dean-da-dev.co.uk/api/audit';
const TIMEOUT_MS = 45_000; // real browser rendering can take 20-30s

/**
 * Fetches a real, structured audit from the Growth Audit product for the
 * given website. Returns the full AuditResult on success, or null on any
 * failure (unreachable site, timeout, malformed response) — callers must
 * treat null as "no audit available", never fabricate findings in its place.
 *
 * @param {string} url
 * @returns {Promise<object|null>}
 */
async function fetchGrowthAudit(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const { data } = await axios.post(
      GROWTH_AUDIT_URL,
      { url },
      { timeout: TIMEOUT_MS, headers: { 'content-type': 'application/json' } },
    );
    if (!data || !Array.isArray(data.categories)) return null;
    return data;
  } catch (err) {
    console.warn(`[growthAuditClient] audit failed for ${url}: ${err.response?.data?.error ?? err.message}`);
    return null;
  }
}

module.exports = { fetchGrowthAudit, GROWTH_AUDIT_URL };
