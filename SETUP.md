# Client Acquisition Engine — Setup Guide

## Prerequisites
- Node.js 18+
- Firebase CLI: `npm install -g firebase-tools`
- A Google account (for Gmail API)
- Firebase project with **Blaze plan** (required for outbound network calls from Cloud Functions)

---

## 1. Create the Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project**, name it (e.g. `client-acquisition`), follow the steps
3. Enable **Firestore Database** (Production mode is fine; adjust rules below)
4. Upgrade to the **Blaze plan** (pay-as-you-go, needed for external HTTP calls in Functions)

### Firestore Security Rules (paste in Firebase Console → Firestore → Rules)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leads/{leadId} {
      allow read, write: if request.auth != null;
    }
  }
}
```
> For local dev with the emulator you can set `allow read, write: if true;` temporarily.

---

## 2. Enable the Gmail API & Get OAuth2 Credentials

### 2a. Enable the API
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → select your Firebase project
2. Navigate to **APIs & Services → Library**
3. Search for **Gmail API** and click **Enable**

### 2b. Create OAuth2 Credentials
1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Desktop app** (name it anything)
3. Download the JSON — you'll need `client_id` and `client_secret`

### 2c. Get a Refresh Token (one-time)
Run this Node.js script locally (replace the placeholders):

```js
// get-refresh-token.js
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const CLIENT_ID     = 'YOUR_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';
const REDIRECT_URI  = 'http://localhost:3333';
const SCOPE         = 'https://www.googleapis.com/auth/gmail.compose';

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', scope: SCOPE, prompt: 'consent' });

console.log('Open this URL in your browser:\n', authUrl);

http.createServer(async (req, res) => {
  const code = new url.URL(req.url, REDIRECT_URI).searchParams.get('code');
  if (!code) return;
  const { tokens } = await oauth2.getToken(code);
  console.log('\n✅ REFRESH TOKEN:', tokens.refresh_token);
  res.end('Done! Check your terminal.');
  process.exit(0);
}).listen(3333);
```

```bash
node get-refresh-token.js
```

Copy the printed **refresh token** — you'll need it in Step 4.

---

## 3. Get Your AI & Lead API Keys

| Secret Name      | Where to get it |
|------------------|----------------|
| `ANTHROPIC_KEY`  | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `OPENAI_KEY`     | [platform.openai.com](https://platform.openai.com) → API Keys |
| `GEMINI_KEY`     | [aistudio.google.com](https://aistudio.google.com) → Get API Key |
| `GROQ_KEY`       | [console.groq.com](https://console.groq.com) → API Keys |
| `COHERE_KEY`     | [dashboard.cohere.com](https://dashboard.cohere.com) → API Keys |
| `HUNTER_KEY`     | [hunter.io](https://hunter.io) → Dashboard → API (free tier available) |
| `APOLLO_KEY`     | [app.apollo.io](https://app.apollo.io) → Settings → Integrations → API (optional) |

You only need **at least one AI key** — the router tries them in the order listed above.  
Both `HUNTER_KEY` and `APOLLO_KEY` are optional; without them, email lookup is skipped and the draft is saved without a recipient.

---

## 4. Store Keys as Firebase Secrets

Firebase Functions v2 uses **Secret Manager**. Run each command and paste the key when prompted:

```bash
firebase functions:secrets:set ANTHROPIC_KEY
firebase functions:secrets:set OPENAI_KEY
firebase functions:secrets:set GEMINI_KEY
firebase functions:secrets:set GROQ_KEY
firebase functions:secrets:set COHERE_KEY
firebase functions:secrets:set HUNTER_KEY
firebase functions:secrets:set APOLLO_KEY
firebase functions:secrets:set GMAIL_CLIENT_ID
firebase functions:secrets:set GMAIL_CLIENT_SECRET
firebase functions:secrets:set GMAIL_REFRESH_TOKEN
```

> Keys stored in Secret Manager are **never** in source code or environment files.  
> They're injected at runtime via `process.env.SECRET_NAME`.

To verify what's stored:
```bash
firebase functions:secrets:access ANTHROPIC_KEY
```

---

## 5. Wire Secrets into the Function

In `functions/index.js`, the `onCall` handler needs to declare which secrets it uses.  
Update the `onCall` options to include them:

```js
exports.generateLeadDraft = onCall(
  {
    timeoutSeconds: 120,
    memory: '512MiB',
    secrets: [
      'ANTHROPIC_KEY', 'OPENAI_KEY', 'GEMINI_KEY', 'GROQ_KEY', 'COHERE_KEY',
      'HUNTER_KEY', 'APOLLO_KEY',
      'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN',
    ],
  },
  async (request) => { /* ... */ }
);
```

---

## 6. Configure the Frontend

```bash
cp .env.example .env.local
```

Fill in `.env.local` with values from **Firebase Console → Project Settings → Your apps → SDK setup**:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc
```

---

## 7. Install Dependencies & Deploy

```bash
# Frontend
npm install

# Cloud Functions
cd functions && npm install && cd ..

# Initialize Firebase (if not done)
firebase init   # select: Functions, Firestore, Hosting (optional)

# Deploy functions
firebase deploy --only functions

# Run frontend locally
npm run dev

# (Optional) Deploy frontend to Firebase Hosting
npm run build
firebase deploy --only hosting
```

---

## 8. Local Development with Emulators

```bash
# Terminal 1 — Firebase emulators
firebase emulators:start --only functions,firestore

# Terminal 2 — Vite dev server
npm run dev
```

The frontend automatically connects to local emulators in dev mode if you add this to `src/firebase.js`:
```js
import { connectFunctionsEmulator } from 'firebase/functions';
import { connectFirestoreEmulator } from 'firebase/firestore';

if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(getFunctions(app), 'localhost', 5001);
}
```

---

## AI Failover Order

The router tries providers in this order until one succeeds:
1. **Anthropic** — `claude-opus-4-8` (highest quality)
2. **OpenAI** — `gpt-4o`
3. **Google Gemini** — `gemini-1.5-pro`
4. **Groq** — `llama-3.3-70b-versatile` (fastest)
5. **Cohere** — `command-r-plus`

Any `429` (rate limit), `403` (auth/quota), network timeout, or other error triggers automatic failover to the next provider.
