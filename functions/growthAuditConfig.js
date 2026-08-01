'use strict';

// Single source of truth for the Growth Audit tool's public URL — every
// outreach message links here (the prospect runs their own audit), never
// to a PDF-send flow. Never hardcode this URL anywhere else; import it.
const AUDIT_TOOL_URL = 'https://app.dean-da-dev.co.uk/';

// Only ever included in outreach when explicitly opted into (email only,
// per spec) — the audit link is the primary CTA, not this.
const PORTFOLIO_URL = 'https://www.dean-da-dev.co.uk/portfolio';

/**
 * Builds the audit tool link a prospect gets sent. A single short `ref` param
 * (rather than the old utm_source/utm_medium/utm_campaign trio) keeps the
 * link readable when it's pasted into a plain-text message, while still
 * being distinguishable per channel in analytics — no new tracking
 * infrastructure required (the Growth Audit app doesn't need to do anything
 * special to "support" it).
 *
 * @param {string} [channel]
 * @returns {string}
 */
function buildAuditToolUrl(channel) {
  const params = new URLSearchParams({ ref: `outreach-${channel || 'general'}` });
  return `${AUDIT_TOOL_URL}?${params.toString()}`;
}

module.exports = { AUDIT_TOOL_URL, PORTFOLIO_URL, buildAuditToolUrl };
