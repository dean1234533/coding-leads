'use strict';

/**
 * RFC 2047-encodes a MIME header value if it contains any non-ASCII
 * characters (em dashes, curly quotes, accented names, £/€, etc.) — plain
 * SMTP headers must be 7-bit ASCII, so a raw UTF-8 byte like an em dash
 * dropped straight into a Subject: line gets mis-decoded as Latin-1/
 * Windows-1252 by mail clients, showing up as mojibake (e.g. "Ã¢Â€Â"").
 * Pure-ASCII values pass through unchanged.
 */
function encodeMimeHeader(value) {
  const str = String(value ?? '');
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(str)) return str;
  return `=?UTF-8?B?${Buffer.from(str, 'utf8').toString('base64')}?=`;
}

module.exports = { encodeMimeHeader };
