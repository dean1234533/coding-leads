import { getToken, onMessage } from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, messagingPromise } from '../firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Requests notification permission, registers the dedicated
 * firebase-messaging-sw.js service worker (kept separate from the app's
 * Workbox PWA service worker), and saves the resulting device token via the
 * savePushToken Cloud Function. Returns { success, reason } rather than
 * throwing, since every step here has a real-world way to fail (permission
 * denied, unsupported browser, missing VAPID key) that the caller needs to
 * show the user, not crash on.
 */
export async function enablePushNotifications() {
  if (!VAPID_KEY) return { success: false, reason: 'Push notifications aren’t configured yet (missing VAPID key).' };

  const messaging = await messagingPromise;
  if (!messaging) return { success: false, reason: 'Push notifications aren’t supported in this browser.' };

  if (!('Notification' in window)) return { success: false, reason: 'This browser doesn’t support notifications.' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { success: false, reason: 'Notification permission was not granted.' };

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return { success: false, reason: 'Could not get a device token.' };

    const fn = httpsCallable(getFunctions(app), 'savePushToken');
    await fn({ token });
    return { success: true };
  } catch (err) {
    return { success: false, reason: err?.message ?? 'Failed to register for notifications.' };
  }
}

/**
 * Foreground pushes never trigger an OS notification banner on their own —
 * browsers only do that for background pushes. Call this once (e.g. from
 * the CRM page root) with a callback that shows an in-app banner instead.
 */
export async function onForegroundPush(callback) {
  const messaging = await messagingPromise;
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => callback(payload.notification ?? {}));
}
