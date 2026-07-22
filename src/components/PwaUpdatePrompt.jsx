import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

// 1 hour was too slow in practice — real symptom seen: calls to
// authenticated functions going out with no auth token at all for hours,
// traced back to a PWA tab that had been open across a stretch of backend
// auth changes and never got the update prompt in time to reload. iOS PWAs
// also freeze `setInterval` while backgrounded, so even 5 minutes isn't
// enough on its own — the visibilitychange listener below covers that by
// checking the instant the app comes back to the foreground, regardless of
// how long it was frozen.
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * skipWaiting + clientsClaim alone only mean a new service worker takes over
 * on the *next* navigation — a tab left open (or an iOS PWA that isn't fully
 * force-closed) can sit on stale assets indefinitely otherwise. This polls
 * for updates while the app is open and prompts to reload once one lands,
 * instead of requiring a manual delete + reinstall.
 */
export default function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState(null);

  useEffect(() => {
    const update = registerSW({
      immediate: true,
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS);
        const checkOnResume = () => { if (document.visibilityState === 'visible') registration.update(); };
        document.addEventListener('visibilitychange', checkOnResume);
        window.addEventListener('focus', checkOnResume);
      },
      onNeedRefresh() {
        setNeedRefresh(true);
      },
    });
    setUpdateSW(() => update);
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-gray-900 px-4 py-3 shadow-lg shadow-black/40">
        <p className="text-xs text-gray-300">A new version is ready.</p>
        <button
          onClick={() => updateSW?.(true)}
          className="whitespace-nowrap rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:from-blue-400 hover:to-cyan-400"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
