'use client';

import { useEffect, useState } from 'react';

// Not in lib.dom.d.ts yet — Chrome/Edge/Android-only event, feature-detected
// below rather than relied on for typing correctness.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Broadened from a Safari-only check (2026-08-14, explicit user report:
// "the download button does nothing on my iPhone"). No iOS browser has a
// `beforeinstallprompt` API — Chrome-iOS/Firefox-iOS/Edge-iOS are all
// WebKit under the hood and equally need the manual Share → "Sur l'écran
// d'accueil" flow, so gating the hint on the UA literally containing
// "Safari" silently dropped the hint (and left the button doing nothing
// visible) for anyone whose default iPhone browser isn't Safari itself.
function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

// In-app browsers (WhatsApp/Instagram/Facebook/Messenger/TikTok/Line
// webviews) can't add to the home screen at all — their Share sheet either
// lacks the option or the webview blocks it outright. If the YeOyo link was
// opened from a shared message (very likely for a link under test), this is
// the actual reason nothing happens on tap, distinct from "you're on iOS,
// use Share" — the fix here is "open this link in Safari first."
function isInAppBrowser(): boolean {
  const ua = window.navigator.userAgent;
  return /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter|TikTok|WhatsApp/i.test(ua);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own non-standard flag — no (display-mode: standalone)
    // media-query support there.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Shared install-prompt plumbing so both the dismissible home banner
// (InstallPwaPrompt) and a permanent manual entry point (Paramètres →
// À propos) trigger the exact same native install flow instead of each
// re-registering its own `beforeinstallprompt` listener — the event only
// fires once per page load and only one listener actually gets a live
// reference to it if two components each call `preventDefault()`.
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [inAppBrowser, setInAppBrowser] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Non-fatal — the app works fine without it, installability just
        // won't be offered on browsers that require a registered SW.
      });
    }

    setInstalled(isStandalone());
    setIosHint(isIos());
    setInAppBrowser(isInAppBrowser());

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    function onInstalled() {
      setDeferredPrompt(null);
      setInstalled(true);
    }
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return {
    /** Native install available right now (Chrome/Edge/Android). */
    canInstall: !!deferredPrompt,
    install,
    /** No native prompt API on this browser — show manual "Partager → Sur l'écran d'accueil" steps instead. */
    iosHint,
    /** Opened from an in-app browser (WhatsApp/Instagram/…) — Add to Home
     *  Screen isn't available there at all, tell the user to open in Safari
     *  first instead of showing the (non-functional) share-icon steps. */
    inAppBrowser,
    /** Already running as an installed/standalone app — nothing to offer. */
    installed,
  };
}
