'use strict';

// Single source of truth for the Growth Audit tool's public URL — every
// outreach message links here (the prospect runs their own audit), never
// to a PDF-send flow. Never hardcode this URL anywhere else; import it.
const AUDIT_TOOL_URL = 'https://app.dean-da-dev.co.uk/';

// Only ever included in outreach when explicitly opted into (email only,
// per spec) — the audit link is the primary CTA, not this.
const PORTFOLIO_URL = 'https://www.dean-da-dev.co.uk/portfolio';

/**
 * Builds a clean-looking referral link. The compact payload lets Growth
 * Audit prefill the prospect's website and attribute conversions without
 * exposing a row of marketing query parameters.
 */
function buildAuditToolUrl(channel, { website, leadId, leadCollection } = {}) {
  if (!website && !leadId) return AUDIT_TOOL_URL;
  const payload = {
    v: 1,
    site: website || undefined,
    channel: CHANNELS.has(channel) ? channel : 'email',
    leadId: leadId || undefined,
    leadCollection: leadCollection || undefined,
  };
  const referral = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${AUDIT_TOOL_URL}?r=${referral}`;
}

const CHANNELS = new Set(['email', 'whatsapp', 'instagram', 'facebook', 'linkedin']);

module.exports = { AUDIT_TOOL_URL, PORTFOLIO_URL, buildAuditToolUrl };
