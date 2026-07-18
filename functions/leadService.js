'use strict';

const axios = require('axios');

/**
 * Looks up a business owner's email address using the Hunter.io Email Finder API.
 *
 * Hunter.io free tier allows 50 searches/month — enough for initial outreach.
 * Docs: https://hunter.io/api-documentation/v2#email-finder
 *
 * @param {string} domain    - The business domain, e.g. "riversidegym.com"
 * @param {string} firstName - The owner's first name
 * @returns {Promise<string|null>} The email address if found, otherwise null
 */
async function findOwnerEmail(domain, firstName) {
  const apiKey = process.env.HUNTER_KEY;

  // If no key is configured, skip silently — draft will have no recipient
  if (!apiKey) {
    console.warn('[leadService] HUNTER_KEY not set — skipping email lookup.');
    return null;
  }

  try {
    const url = new URL('https://api.hunter.io/v2/email-finder');
    url.searchParams.set('domain', domain);
    url.searchParams.set('first_name', firstName);
    url.searchParams.set('api_key', apiKey);

    const response = await axios.get(url.toString(), { timeout: 10_000 });

    const email = response.data?.data?.email ?? null;

    if (email) {
      console.log(`[leadService] Email found for ${domain}: ${email}`);
    } else {
      console.log(`[leadService] No email found for ${domain}.`);
    }

    return email;
  } catch (err) {
    // Log but don't throw — a failed lookup shouldn't block draft creation
    console.warn(`[leadService] Hunter.io request failed: ${err.message}`);
    return null;
  }
}

/**
 * Looks up a generic/best-guess contact email for a domain using Hunter.io's
 * Domain Search API — used when there's no known contact name to search
 * against (e.g. a backlink prospect found via search, not a named business
 * owner). Prefers a "generic" mailbox (hello@, contact@, info@) over a
 * personal one, since a personal name-guess without a name to match against
 * is unreliable.
 * Docs: https://hunter.io/api-documentation/v2#domain-search
 *
 * @param {string} domain - The site's domain, e.g. "builder.io"
 * @returns {Promise<string|null>} The email address if found, otherwise null
 */
async function findGenericEmail(domain) {
  const apiKey = process.env.HUNTER_KEY;

  if (!apiKey) {
    console.warn('[leadService] HUNTER_KEY not set — skipping email lookup.');
    return null;
  }

  try {
    const url = new URL('https://api.hunter.io/v2/domain-search');
    url.searchParams.set('domain', domain);
    url.searchParams.set('api_key', apiKey);

    const response = await axios.get(url.toString(), { timeout: 10_000 });

    const emails = response.data?.data?.emails ?? [];
    const generic = emails.find((e) => e.type === 'generic');
    const email = generic?.value ?? emails[0]?.value ?? null;

    if (email) {
      console.log(`[leadService] Generic email found for ${domain}: ${email}`);
    } else {
      console.log(`[leadService] No email found for ${domain}.`);
    }

    return email;
  } catch (err) {
    console.warn(`[leadService] Hunter.io domain search failed: ${err.message}`);
    return null;
  }
}

module.exports = { findOwnerEmail, findGenericEmail };
