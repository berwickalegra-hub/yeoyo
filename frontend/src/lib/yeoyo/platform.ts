// Shared browser/platform detection — used by usePwaInstall (install flow)
// and usePushNotifications (push is iOS-only after home-screen install).

// The UA regex is deliberately broad — matched on device, not on "Safari"
// (2026-08-14, explicit user report: "the download button does nothing on
// my iPhone"). No iOS browser has a `beforeinstallprompt` API: Chrome-iOS /
// Firefox-iOS / Edge-iOS are all WebKit under the hood and equally need the
// manual Share → "Sur l'écran d'accueil" flow, so gating on the UA
// containing "Safari" silently dropped the install hint for anyone whose
// default iPhone browser isn't Safari itself.
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
