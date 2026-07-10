import { initializeApp }          from 'firebase/app';
import { getFirestore }           from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
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

// Silently sign in anonymously so that:
//   1. Firestore security rules (request.auth != null) are satisfied
//   2. Firebase callable functions receive a valid auth token (fixes CORS/IAM rejection)
// The user never sees a login screen — the session is transparent.
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth).catch((err) => {
      console.error('[firebase] Anonymous sign-in failed:', err.message);
    });
  }
});
