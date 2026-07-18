import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

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
