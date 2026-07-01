import { useState, useEffect } from 'react';

export default function InstallBanner() {
  const [prompt,    setPrompt]    = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Capture the install prompt before the browser shows it
    function onBeforeInstall(e) {
      e.preventDefault();
      setPrompt(e);
    }
    // Hide if already installed (running as standalone PWA)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    };
  }, []);

  async function handleInstall() {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setPrompt(null);
  }

  if (installed || dismissed || !prompt) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-300">Add to Home Screen</p>
            <p className="text-xs text-blue-400/70 truncate">Install the app for quick access from your phone</p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={handleInstall}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
          >
            Install
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="text-blue-400/60 hover:text-blue-300 transition"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
