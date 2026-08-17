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
  // Only intercept safe, bodyless GETs. Re-issuing fetch(event.request) for
  // a POST/PUT/PATCH/DELETE (e.g. a multipart photo upload) can fail to
  // re-read the already-consumed request body stream, surfacing as an
  // unhandled "Failed to fetch" here instead of the real page-level error
  // handling further up — 2026-08-18, explicit user report of uploads and
  // navigation intermittently failing with exactly this signature.
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request));
});
