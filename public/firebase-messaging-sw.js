// Firebase Cloud Messaging background handler — a static, plain-JS service
// worker, deliberately separate from the Workbox-generated sw.js this app
// already uses for PWA offline caching. A push subscription is tied to
// whichever specific SW registration created it (via getToken's
// serviceWorkerRegistration option), not to whichever SW currently controls
// page fetches, so this coexists safely without touching the other one.
//
// Config values are hardcoded because a static file can't read Vite env
// vars — these are the same public, client-visible values already embedded
// in the built app bundle (Firebase web config is not a secret).
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCSmaw0LG6BcPirdZNFAxECUoyi89JAQz0',
  authDomain: 'coding-leads-38d68.firebaseapp.com',
  projectId: 'coding-leads-38d68',
  storageBucket: 'coding-leads-38d68.firebasestorage.app',
  messagingSenderId: '954829398564',
  appId: '1:954829398564:web:37270264aa11286dcf2eb1',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  const link = payload.fcmOptions?.link ?? payload.data?.link ?? '/outreach-crm';
  self.registration.showNotification(title ?? 'Follow-up due', {
    body,
    icon: '/icon.svg',
    data: { link },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link ?? '/outreach-crm';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('/outreach-crm') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
