// Minimal service worker — exists solely to satisfy Chrome/Edge's PWA
// installability requirement (a registered SW with a fetch handler).
// Deliberately no caching strategy: this is a data-driven app (auth,
// messages, payments) where stale cached responses would be actively wrong,
// not just annoying. Every request passes straight through to the network.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
