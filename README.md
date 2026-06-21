# Client Outreach Dashboard

A React + Firebase dashboard that automates cold outreach for local businesses.  
Submit a company name, website, and owner name — the app finds their email via Hunter.io  
and saves a personalized Gmail draft to your account. No email is ever sent automatically.

---

## Tech Stack

| Layer     | Technology                                      |
|-----------|-------------------------------------------------|
| Frontend  | React 18, Vite, Tailwind CSS, Firebase SDK v10  |
| Backend   | Firebase Cloud Functions v2 (Node 18)           |
| Database  | Cloud Firestore (real-time lead tracking)       |
| Email     | Gmail API via OAuth2 (draft creation only)      |
| Lead Data | Hunter.io Email Finder API (free tier)          |

---

## Project Structure

```
.
├── src/
│   ├── components/
│   │   └── LeadTable.jsx       # Real-time lead history table
│   ├── pages/
│   │   └── LeadDashboard.jsx   # Main dashboard page
│   ├── firebase.js             # Firebase app initialization
│   ├── main.jsx                # React entry point
│   └── index.css               # Tailwind directives
├── functions/
│   ├── index.js                # createOutreachDraft callable function
│   ├── leadService.js          # Hunter.io email lookup
│   ├── gmailService.js         # Gmail API draft creation
│   └── package.json            # Function dependencies
├── .env.example                # Frontend environment variable template
├── package.json                # Frontend dependencies
└── README.md
```

---

## Prerequisites

- **Node.js 18+**
- **Firebase CLI** — `npm install -g firebase-tools`
- A **Firebase project** on the **Blaze plan** (required for external HTTP calls in Functions)
- A **Google account** with Gmail (drafts are saved here)

---

## Part 1 — Enable the Gmail API

### 1a. Enable the API in Google Cloud

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Select the same Google Cloud project linked to your Firebase project
3. Navigate to **APIs & Services → Library**
4. Search for **Gmail API** and click **Enable**

### 1b. Create OAuth 2.0 Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Set **Application type** to **Desktop app** (name it anything, e.g. "Outreach Draft Creator")
4. Click **Create** — save the **Client ID** and **Client Secret** shown on screen

### 1c. Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Set User Type to **External**, click Create
3. Fill in the required fields (App name, support email)
4. Under **Scopes**, click **Add or Remove Scopes** and add:
   ```
   https://www.googleapis.com/auth/gmail.compose
   ```
5. Under **Test users**, add your Gmail address
6. Save and continue

### 1d. Get a Refresh Token (one-time setup)

Run this script locally after replacing the two placeholders:

```js
// get-token.js — run once, then delete
const { google } = require('googleapis');
const http       = require('http');
const url        = require('url');

const CLIENT_ID     = 'PASTE_YOUR_CLIENT_ID';
const CLIENT_SECRET = 'PASTE_YOUR_CLIENT_SECRET';
const REDIRECT_URI  = 'http://localhost:3333';
const SCOPE         = 'https://www.googleapis.com/auth/gmail.compose';

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt:      'consent',  // force refresh token to be returned
  scope:       SCOPE,
});

console.log('\nOpen this URL in your browser:\n', authUrl, '\n');

http.createServer(async (req, res) => {
  const code = new url.URL(req.url, REDIRECT_URI).searchParams.get('code');
  if (!code) return;
  const { tokens } = await oauth2.getToken(code);
  console.log('\n✅ Refresh token:', tokens.refresh_token);
  res.end('Done! Copy the token from your terminal, then close this tab.');
  process.exit(0);
}).listen(3333, () => console.log('Waiting for OAuth callback on http://localhost:3333 ...'));
```

```bash
node -e "require('googleapis')" 2>/dev/null || npm install googleapis
node get-token.js
```

Copy the **refresh token** printed in the terminal — you'll use it in Part 2.

---

## Part 2 — Set Firebase Environment Variables

All secrets are stored in **Firebase Secret Manager** — they are never in source code.

```bash
# AI / Lead API
firebase functions:secrets:set HUNTER_KEY

# Gmail OAuth2
firebase functions:secrets:set GMAIL_CLIENT_ID
firebase functions:secrets:set GMAIL_CLIENT_SECRET
firebase functions:secrets:set GMAIL_REFRESH_TOKEN
```

When prompted, paste the value for each key and press Enter.

> **Where to get each key:**
> | Secret                | Source |
> |-----------------------|--------|
> | `HUNTER_KEY`          | [hunter.io](https://hunter.io) → Dashboard → API (free tier: 25 searches/mo) |
> | `GMAIL_CLIENT_ID`     | Step 1b above |
> | `GMAIL_CLIENT_SECRET` | Step 1b above |
> | `GMAIL_REFRESH_TOKEN` | Step 1d above |

To verify a stored secret:
```bash
firebase functions:secrets:access HUNTER_KEY
```

---

## Part 3 — Configure the Frontend

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your Firebase project values from  
**Firebase Console → Project Settings → Your apps → SDK setup and configuration**:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc
```

---

## Part 4 — Install & Run

```bash
# Install frontend dependencies
npm install

# Install function dependencies
cd functions && npm install && cd ..

# Run locally (hot reload)
npm run dev
```

### Deploy to Firebase

```bash
# Deploy Cloud Functions
firebase deploy --only functions

# Build and deploy frontend to Firebase Hosting (optional)
npm run build
firebase deploy --only hosting
```

---

## Firestore Security Rules

Paste these in **Firebase Console → Firestore → Rules** before deploying:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leads/{leadId} {
      // Restrict to authenticated users in production
      allow read, write: if request.auth != null;
    }
  }
}
```

For local emulator development you can temporarily use `allow read, write: if true;`.

---

## Local Development with Emulators

```bash
# Terminal 1
firebase emulators:start --only functions,firestore

# Terminal 2
npm run dev
```

Add the following to `src/firebase.js` to route requests to the local emulators in dev mode:

```js
import { connectFirestoreEmulator }  from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(getFunctions(app), 'localhost', 5001);
}
```

---

## How It Works

```
User submits form
      │
      ▼
createOutreachDraft (Cloud Function)
      │
      ├─ 1. Validate inputs
      ├─ 2. Write lead to Firestore (status: "pending")
      ├─ 3. Hunter.io → find owner email by domain + first name
      ├─ 4. Populate static 3-sentence email template
      ├─ 5. Gmail API → create draft (NEVER sends)
      └─ 6. Update Firestore (status: "draft_created")
                │
                ▼
         LeadTable updates via onSnapshot (real-time)
```

The Gmail draft appears in your **Drafts** folder immediately.  
Open it, review, add/confirm the recipient, and send manually when ready.
