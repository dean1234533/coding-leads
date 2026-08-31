'use strict';

// Single source of truth for Bookrightly's public URL — every outreach
// message links here. Never hardcode this URL anywhere else; import it.
// (Formerly pointed at the Growth Audit self-serve tool at
// app.dean-da-dev.co.uk — outreach moved to pitching Bookrightly directly
// instead of an audit tool, see growthAuditOutreachWriter.js.)
const PRODUCT_URL = 'https://bookrightly.co.uk/';

module.exports = { PRODUCT_URL };
