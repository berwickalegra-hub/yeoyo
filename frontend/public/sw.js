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
  // Catch here, not just up in page code: an unhandled rejection from this
  // fetch surfaces as a scary "FetchEvent resulted in a network error
  // response" + "Uncaught TypeError: Failed to fetch" pair in devtools even
  // when it's just a transient hiccup (dev-server HMR reload, or the tab
  // navigating away mid-request aborts it) — 2026-08-30, explicit user
  // report from the Découvrir page. Returning a Response instead of letting
  // the promise reject keeps the passthrough behavior but resolves quietly.
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(null, { status: 503, statusText: 'Service Unavailable' }),
    ),
  );
});

// Web Push — payload is JSON: { title, body, url, tag }. See
// src/lib/server/push/index.ts. `tag` collapses repeat notifications for
// the same conversation/request into one.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'YeOyo', {
      body: data.body || '',
      tag: data.tag,
      icon: '/pwa/icon/192',
      badge: '/pwa/icon/192',
      data: { url: data.url || '/app' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          // Chain focus → navigate so waitUntil keeps the SW alive for both;
          // focus() resolves to the WindowClient in modern browsers, guard
          // for undefined and fall back to the original client.
          return client.focus().then((c) => {
            const w = c || client;
            return 'navigate' in w ? w.navigate(target) : undefined;
          });
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
