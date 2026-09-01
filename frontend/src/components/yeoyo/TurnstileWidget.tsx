'use client';

import { useEffect, useRef } from 'react';

// Cloudflare Turnstile — invisible/managed anti-bot widget on the signup form.
//
// Inert without NEXT_PUBLIC_TURNSTILE_SITE_KEY: renders nothing, and the
// server (lib/server/auth/turnstile.ts) also treats the check as optional, so
// the form works unchanged. When the key IS present the widget mints a
// single-use token that the signup request forwards for server-side
// validation.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function isTurnstileEnabled(): boolean {
  return !!SITE_KEY;
}

let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('turnstile script failed to load'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function TurnstileWidget({
  onToken,
  onExpire,
  // Bump this number to force a fresh challenge (e.g. after a failed submit —
  // Turnstile tokens are single-use, so the previous one is already spent).
  resetSignal = 0,
  className,
}: {
  onToken: (token: string) => void;
  onExpire?: () => void;
  resetSignal?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Keep the latest callbacks in refs so the render effect can run once.
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  onTokenRef.current = onToken;
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;
    let cancelled = false;
    const el = containerRef.current;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(el, {
          sitekey: SITE_KEY,
          theme: 'auto',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onExpireRef.current?.(),
          'error-callback': () => onExpireRef.current?.(),
        });
      })
      .catch(() => {
        // Script blocked (ad-blocker) or offline. The widget stays empty; the
        // server still enforces if it can reach siteverify, and fails open if
        // it can't — so signup remains possible either way.
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* already gone */
        }
        widgetIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (resetSignal === 0) return;
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        /* widget not ready yet — nothing to reset */
      }
    }
  }, [resetSignal]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className={className} />;
}
