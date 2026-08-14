'use client';

import { useEffect, useState } from 'react';

// Not in lib.dom.d.ts yet — Chrome/Edge/Android-only event, feature-detected
// below rather than relied on for typing correctness.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  return isIos && isSafari;
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

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Non-fatal — the app works fine without it, installability just
        // won't be offered on browsers that require a registered SW.
      });
    }

    setInstalled(isStandalone());
    setIosHint(isIosSafari());

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
    /** Already running as an installed/standalone app — nothing to offer. */
    installed,
  };
}
