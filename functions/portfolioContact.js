'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { notifyOwner } = require('./pushNotifications');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * submitPortfolioContact — public inbound endpoint for dean-da-dev.co.uk's
 * contact form (a separate static site, no Firebase SDK there — plain
 * fetch() POST rather than a callable, same public-endpoint pattern as
 * gmailOAuthCallback/confirmBooking elsewhere in this file). Every
 * submission becomes a crmLeads doc, source "Portfolio Contact Form", so it
 * flows straight into the existing pipeline — shows up in the CRM, and the
 * NEW_CRM_LEAD workflow (see workflowEngine.js) picks it up on its next
 * 15-minute run same as any other new lead.
 */
const submitPortfolioContact = onRequest(
  { cors: true, invoker: 'public', timeoutSeconds: 20, memory: '256MiB', secrets: ['APP_URL'] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed.' });
      return;
    }

    const { name, email, phone, message, honeypot } = req.body ?? {};

    // Bots fill every field including ones a real form hides via CSS — a
    // silent "success" (rather than a 4xx) means a bot never learns to
    // detect and route around this, unlike a validation error would.
    if (honeypot) {
      res.status(200).json({ success: true });
      return;
    }

    if (!name?.trim() || !email?.trim() || !EMAIL_RE.test(email.trim())) {
      res.status(400).json({ success: false, error: 'A valid name and email are required.' });
      return;
    }

    const db = getFirestore();
    await db.collection('crmLeads').add({
      businessName: name.trim(),
      contactName: name.trim(),
      email: email.trim(),
      phone: phone?.trim() || null,
      notes: message?.trim() || '',
      source: 'Portfolio Contact Form',
      status: 'New',
      dateAdded: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await notifyOwner('New portfolio enquiry', `${name.trim()} just contacted you through dean-da-dev.co.uk.`, '/outreach-crm')
      .catch(() => {}); // never fail the visitor's submission over a push-notification hiccup

    res.status(200).json({ success: true });
  }
);

module.exports = { submitPortfolioContact };
