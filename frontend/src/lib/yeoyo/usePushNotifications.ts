'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { isIos, isStandalone } from '@/lib/yeoyo/platform';
import { unsubscribeCurrentDevice } from '@/lib/yeoyo/push-unsubscribe';

export { unsubscribeCurrentDevice };

export type PushState =
  | 'unsupported'
  | 'ios-needs-install'
  | 'unconfigured'
  | 'default'
  | 'granted'
  | 'denied';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function usePushNotifications(): {
  state: PushState;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
} {
  const { user: authUser, loading: authLoading } = useAuth();
  const authReady = !authLoading && !!authUser;
  const [state, setState] = useState<PushState>('unsupported');
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  useEffect(() => {
    // Wait for AuthProvider's own /api/auth/me to resolve first. Firing the
    // vapid-public-key check in parallel with it 401s in lockstep whenever
    // the access token has already expired (e.g. reopening the app after
    // 15+ min) — the api() wrapper silently refreshes and retries, but the
    // first failed request still logs to the console — 2026-08-30, explicit
    // user report of 401 noise on Découvrir.
    if (!authReady) return;
    let cancelled = false;
    void (async () => {
      const supported =
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;

      if (!supported) {
        if (!cancelled) setState(isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported');
        return;
      }

      let publicKey: string | null = null;
      try {
        const res = await api<{ publicKey: string | null }>('/api/push/vapid-public-key');
        publicKey = res.publicKey;
      } catch {
        publicKey = null;
      }
      if (cancelled) return;
      setVapidKey(publicKey);

      if (!publicKey) {
        setState('unconfigured');
        return;
      }
      if (Notification.permission === 'denied') {
        setState('denied');
        return;
      }
      if (Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? 'granted' : 'default');
        return;
      }
      setState('default');
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady]);

  const enable = useCallback(async () => {
    if (!vapidKey) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setState(permission === 'denied' ? 'denied' : 'default');
      return;
    }
    const applicationServerKey = urlBase64ToUint8Array(vapidKey);
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      }
      let json = sub.toJSON();
      if (!json.keys) {
        // Stale subscription (e.g. VAPID key rotated) — drop it and re-subscribe once.
        await sub.unsubscribe().catch(() => undefined);
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        json = sub.toJSON();
      }
      await api('/api/push/subscribe', {
        method: 'POST',
        body: { endpoint: json.endpoint, keys: json.keys },
      });
      setState('granted');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'InvalidStateError') {
        // A subscription exists with a different applicationServerKey. Drop it and retry once.
        try {
          const reg = await navigator.serviceWorker.ready;
          const existing = await reg.pushManager.getSubscription();
          await existing?.unsubscribe().catch(() => undefined);
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
          const json = sub.toJSON();
          await api('/api/push/subscribe', {
            method: 'POST',
            body: { endpoint: json.endpoint, keys: json.keys },
          });
          setState('granted');
          return;
        } catch {
          /* fall through to the reject below */
        }
      }
      // Do not claim success — leave state as-is and let the caller surface the error.
      throw err;
    }
  }, [vapidKey]);

  const disable = useCallback(async () => {
    await unsubscribeCurrentDevice();
    setState('default');
  }, []);

  return { state, enable, disable };
}
