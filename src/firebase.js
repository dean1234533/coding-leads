import { initializeApp }          from 'firebase/app';
import { getFirestore }           from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getMessaging, isSupported as isMessagingSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// Not every browser/context supports Messaging (e.g. some in-app browsers,
// or non-HTTPS) — resolve to null instead of throwing on init.
export const messagingPromise = isMessagingSupported().then((supported) => (supported ? getMessaging(app) : null));

// The only account allowed into the CRM/tools — enforced again server-side
// by every Cloud Function and by Firestore rules, so this client-side check
// is a UX convenience (fast "wrong account" feedback), not the real gate.
export const OWNER_EMAIL = 'deanburt1308@gmail.com';

const googleProvider = new GoogleAuthProvider();
// Lets a user with multiple Google accounts pick the right one instead of
// silently reusing whichever one Chrome/Gmail already had signed in.
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

// Previously: silent anonymous sign-in on every page load, so Firestore
// rules and callable functions had *some* auth token to check — but that
// meant `request.auth != null` was true for literally any visitor, with
// full read/write/delete on every lead and the ability to invoke every
// Cloud Function (including sending email through the connected Gmail
// account). Replaced with real Google Sign-In gated to OWNER_EMAIL — see
// AuthGate.jsx, which wraps the CRM/tools routes only. The public /book
// page needs no auth at all: its two callable functions (getLiveAvailability,
// confirmBooking) are intentionally public and don't touch Firestore
// directly from the client.
