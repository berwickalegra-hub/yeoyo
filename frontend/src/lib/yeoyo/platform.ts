// Shared browser/platform detection — used by usePwaInstall (install flow)
// and usePushNotifications (push is iOS-only after home-screen install).
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
