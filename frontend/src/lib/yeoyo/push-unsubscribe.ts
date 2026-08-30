import { api } from '@/lib/api';

// Split out of usePushNotifications.ts so AuthContext.tsx (logout calls this)
// and usePushNotifications.ts (which needs useAuth() to gate its own effect,
// 2026-08-30) can both depend on it without a require cycle between the two.

/** Unsubscribe this browser and delete its server row. Safe to call anytime
 *  (no-op if there's no SW / no subscription). Never throws. */
export async function unsubscribeCurrentDevice(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await api('/api/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(
      () => undefined,
    );
    await sub.unsubscribe().catch(() => undefined);
  } catch {
    /* logout must never be blocked by push teardown */
  }
}
