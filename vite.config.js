import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration happens explicitly via PwaUpdatePrompt.jsx (virtual:pwa-register)
      // instead of the auto-injected script, so it can poll for updates and
      // prompt to reload rather than silently waiting for the next full app close.
      injectRegister: null,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Outreach CRM',
        short_name: 'Outreach CRM',
        description: 'Gmail-integrated outreach CRM for dean-da-dev',
        theme_color: '#030712',
        background_color: '#030712',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: 'index.html',
        // Never cache Firebase/Google API calls — they use streaming and can't be cached
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        // Without these, Workbox's default behavior waits for every open tab
        // to be closed before a new service worker activates — a page reload
        // (even a hard one) isn't enough, since the *old* SW is still the one
        // intercepting the reload and serving its own cached files. This app
        // gets updated frequently, so new deploys should take over immediately.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
