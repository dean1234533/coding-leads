# Client Acquisition Engine

**An AI-powered lead generation and outreach CRM for a web development business. It finds local businesses with weak websites, audits them, writes personalised outreach, runs follow-ups, and books discovery calls.**

[![Booking page](https://img.shields.io/badge/live-booking_page-0ea5e9?style=flat-square)](https://coding-leads.vercel.app/book)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![Gmail API](https://img.shields.io/badge/Gmail_API-EA4335?style=flat-square&logo=gmail&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat-square&logo=pwa&logoColor=white)

The public **discovery-call booking page** is live at
[coding-leads.vercel.app/book](https://coding-leads.vercel.app/book). The rest
of the app is a private, sign-in-only dashboard.

---

## Screenshots

<!-- Add images to docs/screenshots/ and uncomment. -->
<!--
| Lead dashboard | Outreach CRM | Booking page |
|---|---|---|
| ![](docs/screenshots/dashboard.png) | ![](docs/screenshots/crm.png) | ![](docs/screenshots/booking.png) |
-->

_Screenshots coming soon._

---

## Features

### Lead discovery
- **Business scanner.** Searches for local businesses by area and category,
  looks up contact details, and runs scheduled auto-scans.
- **Coding leads scout.** Keyword-driven lead scanning with RSS scouting, CSV
  import, and analytics.
- **Backlink prospect scanner** and local-intent analysis
- **Email finding** with Hunter.io and Apollo (both optional)

### Website audits
- An automated technical and design **website audit** for every lead
- **Growth audit outreach.** Picks the most persuasive audit findings and
  writes a tailored email around them.

### AI outreach and CRM
- **Multi-provider AI router** with automatic failover across Anthropic,
  OpenAI, Gemini, Groq, and Cohere
- **Outreach CRM.** Full Gmail integration through OAuth, with inbox threads,
  drafts, sending, labels, and sent stats.
- **AI reply classifier** that sorts replies into interested, not interested,
  and similar categories
- **Scheduled sends, auto follow-ups, and daily follow-up digests**
- **Workflow engine** with an approval queue, so nothing is sent without review
  unless you opt in
- Quality checks on outreach copy, plus call scripts

### Booking
- A public booking page with live availability, booking settings, and Google
  Calendar integration
- A portfolio contact-form endpoint used by
  [dean-da-dev.co.uk](https://www.dean-da-dev.co.uk/)

### App
- An installable PWA with push notifications, update prompts, and error alerts
- Sign-in gated dashboard, with Gmail refresh tokens encrypted at rest

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Tailwind CSS, React Router, vite-plugin-pwa |
| Backend | Firebase Cloud Functions v2 (callables and scheduled jobs), Firestore, Auth |
| Email | Gmail API (OAuth2) |
| AI | Anthropic, OpenAI, Google Gemini, Groq, and Cohere, with failover |
| Data | Hunter.io, Apollo, and Google Calendar |
| Hosting | Vercel (frontend) and Firebase (functions) |
| Testing | Vitest |

---

## Getting started

```bash
git clone https://github.com/dean1234533/coding-leads.git
cd coding-leads
npm install
cd functions && npm install && cd ..
cp .env.example .env.local     # add your VITE_FIREBASE_* config
npm run dev
```

You'll need a Firebase project on the **Blaze** plan, at least one AI provider
key, and Gmail OAuth credentials. Store every key in Firebase Secret Manager
with `firebase functions:secrets:set <NAME>`.

📘 **Full setup guide:** [`SETUP.md`](SETUP.md) covers Gmail OAuth, API keys,
secrets, emulators, and the CRM Gmail connection.

```bash
firebase deploy --only functions   # deploy Cloud Functions
npm test                           # run tests
```

---

## Project structure

```
src/
  pages/        LeadDashboard, OutreachCrmPage, BookingPage
  components/   leads table/detail, CSV import, keyword manager, RSS scout, calendar, call scripts
functions/
  index.js              callable + scheduled function exports
  aiRouter.js           multi-provider AI failover
  websiteAudit.js       technical + design audits
  growthAuditOutreach*  finding selection + outreach writing
  crmGmailService.js    Gmail CRM integration
  workflowEngine.js     automated workflows with approvals
  calendarService.js    booking availability
```

---

## Author

Built by **Dean Da Dev**, a UK full-stack developer building web apps, websites,
and AI tools.

🌐 [dean-da-dev.co.uk](https://www.dean-da-dev.co.uk/) · 💼 [More projects](https://www.dean-da-dev.co.uk/portfolio) · 🐙 [GitHub](https://github.com/dean1234533)
