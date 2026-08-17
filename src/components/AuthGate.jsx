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
  const isUiPreview = import.meta.env.DEV && import.meta.env.VITE_UI_PREVIEW === 'true';
  const [user, setUser] = useState(isUiPreview ? { email: OWNER_EMAIL } : undefined); // undefined = still checking, null = signed out
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isUiPreview) return undefined;
    return onAuthStateChanged(auth, setUser);
  }, [isUiPreview]);

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
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-400" />
          Loading your workspace…
        </div>
      </div>
    );
  }

  const isOwner = user && user.email === OWNER_EMAIL;

  if (!isOwner) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 px-5 py-12">
        <section className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-800 bg-gray-900 shadow-2xl shadow-black/40">
          <div className="border-b border-gray-800 bg-gradient-to-br from-blue-500/15 via-transparent to-emerald-500/10 px-7 py-8 text-left">
            <div className="app-brand-mark">DD</div>
            <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">Private workspace</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-100">Welcome back, Dean.</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">Sign in to manage prospects, outreach, follow-ups, and client opportunities.</p>
          </div>
          <div className="space-y-4 px-7 py-6 text-left">
        {user ? (
          <>
            <p className="text-sm leading-6 text-gray-500">
              Signed in as <span className="text-gray-300">{user.email}</span>, which isn't authorized for this app.
            </p>
            <button
              onClick={() => signOutUser()}
              className="w-full rounded-xl bg-gray-800 px-4 py-3 text-sm font-semibold text-gray-200 hover:bg-gray-700"
            >
              Sign out and try another account
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="w-full rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:from-blue-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signingIn ? 'Signing in…' : 'Sign in with Google'}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </>
        )}
          </div>
        </section>
      </div>
    );
  }

  return children;
}
