'use strict';

// Single source of truth for the Growth Audit tool's public URL — every
// outreach message links here (the prospect runs their own audit), never
// to a PDF-send flow. Never hardcode this URL anywhere else; import it.
const AUDIT_TOOL_URL = 'https://app.dean-da-dev.co.uk/';

// Only ever included in outreach when explicitly opted into (email only,
// per spec) — the audit link is the primary CTA, not this.
const PORTFOLIO_URL = 'https://www.dean-da-dev.co.uk/portfolio';

/**
 * Builds the audit tool link a prospect gets sent. Deliberately the bare
 * URL, no tracking query string — a link with "?ref=..." or "?utm_..." on
 * the end reads as a marketing/tracking link the moment someone glances at
 * it, which undermines the whole "I just built a free tool, have a look"
 * tone. `channel` is accepted for API-compatibility with existing callers
 * but no longer changes the output.
 *
 * @param {string} [channel]
 * @returns {string}
 */
function buildAuditToolUrl(_channel) {
  return AUDIT_TOOL_URL;
}

module.exports = { AUDIT_TOOL_URL, PORTFOLIO_URL, buildAuditToolUrl };
