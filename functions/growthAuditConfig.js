'use strict';

// Single source of truth for the Growth Audit tool's public URL — every
// outreach message links here (the prospect runs their own audit), never
// to a PDF-send flow. Never hardcode this URL anywhere else; import it.
const AUDIT_TOOL_URL = 'https://app.dean-da-dev.co.uk/';

// Only ever included in outreach when explicitly opted into (email only,
// per spec) — the audit link is the primary CTA, not this.
const PORTFOLIO_URL = 'https://www.dean-da-dev.co.uk/portfolio';

/**
 * Always the bare Growth Audit homepage — no referral/attribution payload.
 * A previous version base64-encoded the website/channel/leadId into a `?r=`
 * query param, which produced a 200+ character blob that read as broken
 * spam in an actual outreach message (especially WhatsApp/SMS, where it's
 * the only thing in the text). Accepts the same (channel, { website,
 * leadId, leadCollection }) signature as before purely so none of its
 * callers need to change — the arguments are otherwise unused.
 */
function buildAuditToolUrl() {
  return AUDIT_TOOL_URL;
}

module.exports = { AUDIT_TOOL_URL, PORTFOLIO_URL, buildAuditToolUrl };
