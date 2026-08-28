'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { isIos, isStandalone } from '@/lib/yeoyo/platform';

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
  const [state, setState] = useState<PushState>('unsupported');
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  const enable = useCallback(async () => {
    if (!vapidKey) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setState(permission === 'denied' ? 'denied' : 'default');
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      }));
    const json = sub.toJSON();
    await api('/api/push/subscribe', {
      method: 'POST',
      body: { endpoint: json.endpoint, keys: json.keys },
    });
    setState('granted');
  }, [vapidKey]);

  const disable = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api('/api/push/subscribe', {
        method: 'DELETE',
        body: { endpoint: sub.endpoint },
      }).catch(() => undefined);
      await sub.unsubscribe().catch(() => undefined);
    }
    setState('default');
  }, []);

  return { state, enable, disable };
}
