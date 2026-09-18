'use strict';

const axios = require('axios');

// Indirected through a mutable object rather than calling axios.post
// directly, purely for testability — this project's Vitest setup doesn't
// reliably intercept vi.mock() for CJS source files (confirmed elsewhere in
// this codebase, see outreachWebsiteAudit.js's own comment on the same
// issue). Tests override this directly; production code never touches it.
const deps = {
  axiosPost: (url, body, config) => axios.post(url, body, config),
};
function __setAxiosPostForTests(fn) {
  deps.axiosPost = fn;
}

const ZERNIO_API_BASE = 'https://zernio.com/api';

// The number SMS gets sent from — one of the account's SMS-enabled numbers
// (provisioned once via Zernio's dashboard, not by this code). UK numbers
// need no carrier registration to send/receive; that's a US-only step per
// Zernio's own docs (POST /v1/phone-numbers/{id}/sms), so a UK number here
// should be usable as soon as SMS is enabled on it.
// TODO: replace with the real E.164 number once provisioned.
const ZERNIO_FROM_NUMBER = process.env.ZERNIO_FROM_NUMBER || '+44REPLACE_ME';

// Same normalization the frontend's formatPhoneIntl uses (wa.me/sms: links),
// except this keeps the leading "+" — Zernio's API wants real E.164
// (wa.me/sms: URIs want it stripped, which is why that one doesn't).
function toE164Uk(phone) {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('44')) return `+${digits}`;
  if (digits.startsWith('0')) return `+44${digits.slice(1)}`;
  return `+${digits}`;
}

/**
 * Sends one SMS via Zernio (POST /v1/sms/messages). Never throws — a bad
 * number, an opted-out recipient, or a missing API key should never block
 * whatever loop called this (e.g. the auto-follow-up batch), so every
 * failure is logged and swallowed, returning null instead.
 *
 * @param {object} params
 * @param {string} params.to - recipient phone number, any reasonable UK format
 * @param {string} params.text - message body (max 10 SMS segments / 1530 GSM-7 chars)
 * @param {string} [params.idempotencyKey] - stable key so a retry never double-sends
 *   (e.g. `followup:${leadId}:${stage}`) — same key+body replays the original
 *   response instead of sending again.
 * @returns {Promise<{id: string, conversationId: string} | null>}
 */
async function sendSms({ to, text, idempotencyKey }) {
  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) {
    console.warn('[zernioSms] ZERNIO_API_KEY not set — skipping SMS send.');
    return null;
  }
  const toE164 = toE164Uk(to);
  if (!toE164) {
    console.warn('[zernioSms] no usable phone number to send to — skipping.');
    return null;
  }
  try {
    const { data } = await deps.axiosPost(
      `${ZERNIO_API_BASE}/v1/sms/messages`,
      { from: ZERNIO_FROM_NUMBER, to: toE164, text },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        timeout: 15_000,
      },
    );
    return { id: data.id, conversationId: data.conversationId };
  } catch (err) {
    // 409 covers two genuinely different, both non-error cases: the
    // recipient replied STOP (a real, expected outcome — not something to
    // retry or alert on), or this exact Idempotency-Key is still in flight
    // from a concurrent call. Neither should look like a failure in logs.
    if (err.response?.status === 409) {
      console.log(`[zernioSms] send to ${toE164} skipped (409): ${err.response.data?.message ?? 'opted out or duplicate send in flight'}`);
      return null;
    }
    console.warn(`[zernioSms] send to ${toE164} failed:`, err.response?.data?.message ?? err.message);
    return null;
  }
}

module.exports = {
  sendSms,
  toE164Uk,
  _internal: { deps, setAxiosPostForTests: __setAxiosPostForTests },
};
