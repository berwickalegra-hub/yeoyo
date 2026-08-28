# Web Push Notifications — Design Spec

**Date:** 2026-08-28
**Status:** Approved by product owner in chat, 2026-08-28.

## 1. Problem & Context

YeOyo already has in-app notifications (`Notification` rows + `NotificationBell`) and
Ably realtime for open conversation threads. What it does **not** have: an OS-level
notification that fires when the app is closed or backgrounded. `frontend/public/sw.js`
is a pass-through stub with no `push` / `notificationclick` handler; there is no
subscription storage, no VAPID config, no client subscribe flow.

The product owner wants real Web Push so a person is pulled back to the app when
something meaningful happens while they are away:

- a **new message** arrives in one of their conversations
- someone **accepts their contact request** (it's a match — a conversation opens)
- someone **sends them a new contact request**

(Explicitly out of scope for push: profile verified/rejected, likes, declined
requests, payments — those stay in-app only.)

## 2. Global Constraints

- Every Route Handler keeps `export const runtime = 'nodejs'` (existing invariant).
  `web-push` uses Node crypto — nodejs runtime is required and already the default.
- Every mutating route keeps `verifyCsrf(req)` first (existing invariant). The new
  `POST/DELETE /api/push/subscribe` are mutations and call `verifyCsrf`.
- No file in CLAUDE.md's protected list is touched. In particular the **outbox
  dispatcher is NOT modified** — push is sent inline from the same routes that
  already call `createNotification`, mirroring how those routes already publish to
  Ably inline (fire-and-forget, wrapped in try/catch, never blocking the response).
- **Graceful degradation:** with `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` /
  `VAPID_SUBJECT` absent, every push code path becomes a silent no-op and the app
  behaves exactly as today. `log.warn` announces the provider is inert at first use,
  matching the Cloudinary/Resend/Ably pattern.
- **Notification preferences stay opt-out (D-10).** Missing event ⇒ enabled. A new
  `push` channel is added alongside `email` / `inApp`; the same
  `isChannelEnabled(prefs, EVENT, 'push')` gate guards every push send. But push
  additionally requires an actual browser subscription to exist — no subscription,
  no send, regardless of prefs.
- **Subscriptions self-heal.** A push send that returns HTTP 404 or 410 (Gone)
  means the browser dropped the subscription; that row is deleted immediately so it
  is never retried.
- The public VAPID key is not a secret and is exposed to the client; the private
  key never leaves the server.

## 3. Data Model Changes

New model, additive, one table:

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  // The browser's push endpoint URL — globally unique per (browser, origin,
  // VAPID key). Re-subscribing with the same browser upserts on this.
  endpoint  String   @unique
  // Encryption keys from the PushSubscription JSON (getKey('p256dh') / ('auth')),
  // base64url. Needed by web-push to encrypt each payload.
  p256dh    String
  auth      String
  // Coarse UA string, for a future "your devices" list and debugging. Optional.
  userAgent String?
  createdAt DateTime @default(now())

  @@index([userId])
}
```

`User` gains the back-relation `pushSubscriptions PushSubscription[]`.

Migration: the same manual flow used throughout this project —
`prisma migrate diff --script` into a new `frontend/prisma/migrations/<ts>_push_subscriptions/`
folder, then `migrate deploy`. One additive table + one unique index + one plain
index; no destructive change, no data backfill.

## 4. Environment / Config

Three new env vars (all optional — absence disables the feature):

| Var | Where | Notes |
|---|---|---|
| `VAPID_PUBLIC_KEY` | server + surfaced to client via API | base64url, from `web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | server only | secret |
| `VAPID_SUBJECT` | server only | `mailto:contact@…` or the site URL; identifies the sender to push services |

Not using `NEXT_PUBLIC_*` for the public key — it is served by
`GET /api/push/vapid-public-key` instead, so a key rotation doesn't need a rebuild
and the "is push configured" check has a single source of truth on the server.

New dependency: `web-push` (add to `frontend/package.json`).

## 5. Server Modules

### 5.1 `frontend/src/lib/server/push/index.ts` (new)

The single choke point for sending push. Nothing else calls `web-push` directly.

```ts
export function isPushConfigured(): boolean
// true iff all three VAPID_* env vars are set.

export async function sendPushToUser(
  prisma: PrismaClient,
  userId: string,
  payload: { title: string; body: string; url: string; tag?: string },
): Promise<void>
```

`sendPushToUser`:
1. returns immediately if `!isPushConfigured()` (with a one-time `log.warn`).
2. loads `PushSubscription` rows for `userId`.
3. `webpush.setVapidDetails(subject, publicKey, privateKey)` once (module-level lazy init).
4. `Promise.allSettled` over `webpush.sendNotification(sub, JSON.stringify(payload))`.
5. for each rejection whose `statusCode` is 404 or 410 → `prisma.pushSubscription.delete({ where: { endpoint } })` (best-effort, swallow).
6. other errors → `log.warn('push send failed', …)`, do not throw.

Never throws. Callers `void sendPushToUser(...)` — it must not affect the HTTP response.

### 5.2 `frontend/src/lib/server/notifications/prefs-merge.ts` (modify — NOT protected)

Widen the channel type from `'email' | 'inApp'` to `'email' | 'inApp' | 'push'`:

```ts
export type ChannelPrefs = { email?: boolean; inApp?: boolean; push?: boolean };
// isChannelEnabled's `channel` param and mergePrefs stay structurally identical —
// they already treat channels generically; only the literal union widens.
```

`prefs-merge.test.ts` gains a small case: `isChannelEnabled({}, 'MESSAGE_RECEIVED', 'push')`
is `true` (opt-out default holds for the new channel), and a `{ push: false }` override
disables it while leaving `inApp` untouched.

## 6. API Routes (new)

All `runtime = 'nodejs'`, all wrapped in `withRequestContext`.

### 6.1 `GET /api/push/vapid-public-key`

`requireAuth`. Returns `{ publicKey: string | null }` — `null` when push is not
configured (client uses this to decide whether to show any push UI at all).

### 6.2 `POST /api/push/subscribe`

`verifyCsrf` → `requireAuth`. Body (zod):

```ts
{ endpoint: string, keys: { p256dh: string, auth: string } }
```

`prisma.pushSubscription.upsert({ where: { endpoint }, create: { …, userId }, update: { userId, p256dh, auth } })`
— the `update` re-points an endpoint to the current user (same physical browser, new
login) and refreshes rotated keys. `userAgent` taken from the request header, truncated
to 255 chars. Returns `201 { ok: true }`.

### 6.3 `DELETE /api/push/subscribe`

`verifyCsrf` → `requireAuth`. Body `{ endpoint: string }`.
`deleteMany({ where: { endpoint, userId } })` (scoped to the caller so one user can't
delete another's row). Returns `200 { ok: true }` even if nothing matched.

## 7. Dispatch Points (modify — none protected)

Each site already loads the recipient's prefs and already calls `createNotification`.
Immediately after the `createNotification` call, add a guarded, non-blocking push:

```ts
if (isChannelEnabled(parsePrefs(prefsRow?.prefs), EVENT, 'push')) {
  void sendPushToUser(prisma, recipientId, { title, body, url, tag });
}
```

| File | Prefs event key | `recipientId` | `url` | `tag` (collapses duplicates) |
|---|---|---|---|---|
| `conversations/[id]/messages/route.ts` (~L261) | `MESSAGE_RECEIVED` | message recipient | `/app/messages/{conversationId}` | `msg:{conversationId}` |
| `contact-requests/[id]/respond/route.ts` (~L152, ACCEPT) | `CONTACT_REQUEST_ACCEPTED` | original requester | `/app/messages/{conversationId}` | `match:{contactRequestId}` |
| `likes/route.ts` (~L304, mutual match) | `CONTACT_REQUEST_ACCEPTED` | the already-waiting side | `/app/messages/{conversationId}` | `match:{matchedRequestId}` |
| `likes/route.ts` (~L314, new request) | `CONTACT_REQUEST` | target | `/app/demandes` | `req:{contactRequestId}` |

The `MESSAGE_RECEIVED` push and the `CONTACT_REQUEST` (new-request) push are gated
`isChannelEnabled(parsePrefs(prefsRow?.prefs), <key>, 'push')` — the prefs event key is the
matching **notification `type`** (so the `push` channel toggles alongside the same event as
`inApp`).

**Implementation ruling (2026-08-28):** the two **match** pushes (`respond` ACCEPT, `likes`
mutual match) ship **ungated**, mirroring the surrounding in-app match notification which is
itself unconditional at those two sites. A subscription must still exist for anything to
send. If a future per-event UI wants to make match push opt-out-able, it must add the
`isChannelEnabled(..., 'CONTACT_REQUEST_ACCEPTED', 'push')` gate at both sites **and** the
equivalent gate on the in-app `createNotification` there, so the two channels stay
consistent. As shipped, `PATCH /api/notifications/prefs` will accept
`{ CONTACT_REQUEST_ACCEPTED: { push: false } }` but it has no effect on match pushes yet.

Copy for each push mirrors the existing `templates.ts` title/body for that event
("Nouveau message de {name}" / preview; "C'est un match avec {name} !"; "{name} s'intéresse
à toi"). The `respond` route's DECLINE path (L66) gets **no** push.

Muted conversations: the message route already checks `!isMutedBy(conversation, recipientId)`
before notifying — the push call sits inside that same block, so a muted thread pushes nothing.

## 8. Service Worker — `frontend/public/sw.js` (modify)

Add two listeners; keep the existing install/activate/fetch untouched.

```js
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const { title, body, url, tag } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: '/pwa/icon/192',
      badge: '/pwa/icon/192',
      data: { url: url || '/app' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => 'focus' in c);
      if (existing) { existing.focus(); existing.navigate(target); return; }
      return self.clients.openWindow(target);
    }),
  );
});
```

Bumping the SW file changes its bytes, so browsers pick up the new version on next
visit (existing `skipWaiting()` + `clients.claim()` already make this immediate).

## 9. Client

### 9.1 `frontend/src/lib/yeoyo/usePushNotifications.ts` (new)

```ts
type PushState =
  | 'unsupported'      // no serviceWorker / PushManager (or iOS Safari not standalone)
  | 'ios-needs-install'// iOS, PushManager exists only after home-screen install
  | 'unconfigured'     // server has no VAPID key
  | 'default'          // supported, not yet asked
  | 'granted'          // subscribed and stored
  | 'denied';          // user blocked at OS/browser level

function usePushNotifications(): {
  state: PushState;
  enable: () => Promise<void>;   // Notification.requestPermission → pushManager.subscribe → POST /api/push/subscribe
  disable: () => Promise<void>;  // pushManager.getSubscription().unsubscribe → DELETE /api/push/subscribe
}
```

- On mount: feature-detect; `GET /api/push/vapid-public-key` (cached) → `unconfigured` if null.
- iOS detection reuses the `isIos()` / `isStandalone()` logic already in `usePwaInstall.ts`
  (extract both helpers into `frontend/src/lib/yeoyo/platform.ts` and re-import from both
  hooks — small, in-scope cleanup; `usePwaInstall` keeps behaving identically).
- `enable()`: `Notification.requestPermission()`; if `granted`,
  `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
  (key converted from base64url to `Uint8Array`), then `POST /api/push/subscribe` with
  `subscription.toJSON()`'s `endpoint` + `keys`.
- Idempotent: if a subscription already exists it is re-`POST`ed (cheap upsert), not re-created.

### 9.2 Home banner — `frontend/src/app/app/decouvrir/page.tsx` (modify)

A dismissible banner in the sidebar column, same mechanism as the existing
`PREMIUM_BANNER_DISMISS_KEY` / `BOOST_BANNER_DISMISS_KEY` (24h localStorage snooze,
`useCardExit` slide-out). New key `PUSH_BANNER_DISMISS_KEY`.

Shown only when `state === 'default'`. Content: bell icon, "Active les notifications",
"Sois prévenu·e dès qu'on t'écrit ou qu'on accepte ton match", a primary "Activer"
button calling `enable()`, and the `×` snooze.

- `state === 'ios-needs-install'` → instead render a short "Installe d'abord YeOyo sur
  ton écran d'accueil pour recevoir les notifications" with the existing install button
  from `usePwaInstall` (`iosHint` path). Same dismiss key.
- `state` of `granted` / `denied` / `unsupported` / `unconfigured` → render nothing.

### 9.3 Settings — `frontend/src/app/app/parametres/notifications/page.tsx` (modify)

Add one `SettingsSection` "Notifications push (cet appareil)" above the existing list:

- a master `Toggle` bound to `state === 'granted'`, calling `enable()` / `disable()`.
- when `state === 'denied'`: toggle disabled + helper "Tu as bloqué les notifications —
  réactive-les dans les réglages de ton navigateur."
- when `ios-needs-install` / `unsupported` / `unconfigured`: helper line explaining why,
  no toggle.
- The existing per-event toggles keep writing `{ email, inApp }` only. No third `push`
  column in v1 — see §10 for the exact master-switch-vs-per-event rule.

## 10. Per-event push vs the master switch — the exact rule

- **Master switch** = does a `PushSubscription` row exist for this user's browser.
  Controlled by the home banner / settings toggle. No subscription ⇒ zero pushes,
  full stop.
- **Per-event** = `isChannelEnabled(prefs, EVENT, 'push')`. Opt-out default: enabled
  unless the user set `{ [EVENT]: { push: false } }`.
- v1 does **not** expose a per-event push checkbox in the UI. Consequence: once a user
  enables push, they get push for all three events. This is intentional for v1 — the
  three events are all high-signal. The `push` channel plumbing is in place so a v2 can
  add the per-event column with no server change.
- Turning the master switch **off** deletes the subscription; it does **not** write any
  `{ push: false }` prefs. Re-enabling later restores all three events.

## 11. Testing

Unit (Vitest), following existing route-test patterns with `prismaMock`:

- `prefs-merge.test.ts` — `push` channel opt-out default + partial override (§5.2).
- `push/index.test.ts` — `isPushConfigured` env gating; `sendPushToUser` no-ops when
  unconfigured; deletes the row on a mocked 410; swallows a 500; never throws.
  (`web-push` is `vi.mock`ed.)
- `api/push/subscribe/route.test.ts` — CSRF required; upsert on POST; scoped deleteMany
  on DELETE; 401 without auth.
- `api/push/vapid-public-key/route.test.ts` — returns the key when set, `null` when not.
- Dispatch points: extend the existing `conversations/[id]/messages/route.test.ts`,
  `contact-requests/[id]/respond/route.test.ts`, `likes/route.test.ts` with one
  assertion each that `sendPushToUser` (mocked) is called with the right `userId` +
  `url` when push is configured and the prefs allow it, and **not** called when
  `{ [EVENT]: { push: false } }` or when unconfigured.

No integration/e2e harness exists in this project (STATUS.md) — manual UAT: install as
PWA on Android + desktop Chrome, enable from the banner, background the app, trigger
each event from a second account, confirm the OS notification and that clicking it
opens the right screen.

## 12. Files Touched — summary

**New:**
- `frontend/prisma/migrations/<ts>_push_subscriptions/migration.sql`
- `frontend/src/lib/server/push/index.ts` (+ `.test.ts`)
- `frontend/src/app/api/push/subscribe/route.ts` (+ `.test.ts`)
- `frontend/src/app/api/push/vapid-public-key/route.ts` (+ `.test.ts`)
- `frontend/src/lib/yeoyo/usePushNotifications.ts`
- `frontend/src/lib/yeoyo/platform.ts` (extracted `isIos` / `isStandalone`)

**Modified:**
- `frontend/prisma/schema.prisma` — `PushSubscription` model + `User` back-relation
- `frontend/package.json` — `web-push` dep
- `frontend/public/sw.js` — `push` + `notificationclick` handlers
- `frontend/src/lib/server/notifications/prefs-merge.ts` (+ test) — `push` channel
- `frontend/src/lib/yeoyo/usePwaInstall.ts` — import helpers from `platform.ts`
- `frontend/src/app/api/conversations/[id]/messages/route.ts` — push on message
- `frontend/src/app/api/contact-requests/[id]/respond/route.ts` — push on accept
- `frontend/src/app/api/likes/route.ts` — push on mutual match + new request
- `frontend/src/app/app/decouvrir/page.tsx` — enable-push banner
- `frontend/src/app/app/parametres/notifications/page.tsx` — push master toggle
- `.env.example` / deployment env — `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`

**Protected files touched:** none.

## 13. Out of Scope / Deferred

- Per-event push checkboxes in settings (plumbing ready, UI not built).
- A "your devices" management list (the `userAgent` column exists for it).
- Retry/backoff on transient push-service 5xx (v1 fires once; the in-app
  `Notification` row is the durable record).
- Push for likes, declined requests, profile verification, payments.
- Batching/quiet-hours.
