'use strict';

const axios = require('axios');

/**
 * Looks up a business owner's email address using the Hunter.io Email Finder API.
 *
 * Hunter.io free tier allows 25 searches/month — enough for initial outreach.
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

module.exports = { findOwnerEmail };
