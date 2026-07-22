import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, OWNER_EMAIL, signInWithGoogle, signOutUser } from '../firebase';

// Wraps the CRM/tools routes only — the public /book page must never be
// wrapped in this, it needs no login at all. Blocks rendering of children
// entirely until a real, signed-in Google session matching OWNER_EMAIL is
// confirmed; every collection read and every Cloud Function call this app
// makes is also independently locked to the same email server-side, so this
// is a real gate, not just a UI nicety.
export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = signed out
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  async function handleSignIn() {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message ?? 'Sign-in failed.');
      }
    } finally {
      setSigningIn(false);
    }
  }

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  const isOwner = user && user.email === OWNER_EMAIL;

  if (!isOwner) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-6 text-center">
        <h1 className="text-lg font-semibold text-gray-100">Coding Leads</h1>
        {user ? (
          <>
            <p className="max-w-sm text-sm text-gray-500">
              Signed in as <span className="text-gray-300">{user.email}</span>, which isn't authorized for this app.
            </p>
            <button
              onClick={() => signOutUser()}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-700"
            >
              Sign out and try another account
            </button>
          </>
        ) : (
          <>
            <p className="max-w-sm text-sm text-gray-500">Sign in with the authorized Google account to continue.</p>
            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signingIn ? 'Signing in…' : 'Sign in with Google'}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </>
        )}
      </div>
    );
  }

  return children;
}
