'use strict';

// Single source of truth for the Growth Audit tool's public URL — every
// outreach message links here (the prospect runs their own audit), never
// to a PDF-send flow. Never hardcode this URL anywhere else; import it.
const AUDIT_TOOL_URL = 'https://app.dean-da-dev.co.uk/';

// Only ever included in outreach when explicitly opted into (email only,
// per spec) — the audit link is the primary CTA, not this.
const PORTFOLIO_URL = 'https://www.dean-da-dev.co.uk/portfolio';

const UTM_MEDIUM_BY_CHANNEL = {
  email: 'email',
  whatsapp: 'whatsapp',
  instagram: 'instagram_dm',
  facebook: 'facebook_messenger',
  linkedin: 'linkedin',
};

/**
 * Builds the audit tool link a prospect gets sent, with UTM params so
 * traffic from outreach is distinguishable in analytics — plain query
 * string params, no new tracking infrastructure required (the Growth Audit
 * app doesn't need to do anything special to "support" them).
 *
 * @param {string} [channel]
 * @returns {string}
 */
function buildAuditToolUrl(channel) {
  const medium = UTM_MEDIUM_BY_CHANNEL[channel] ?? 'outreach';
  const params = new URLSearchParams({
    utm_source: 'outreach',
    utm_medium: medium,
    utm_campaign: 'website_audit',
  });
  return `${AUDIT_TOOL_URL}?${params.toString()}`;
}

module.exports = { AUDIT_TOOL_URL, PORTFOLIO_URL, buildAuditToolUrl };
