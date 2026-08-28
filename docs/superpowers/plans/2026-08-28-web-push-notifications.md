# Web Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver OS-level push notifications (new message, match accepted, new contact request) that fire even when the YeOyo PWA is closed.

**Architecture:** A new `PushSubscription` table stores one row per subscribed browser. A server helper `sendPushToUser` (wrapping the `web-push` library) is called inline — fire-and-forget, never blocking the HTTP response — right after the existing `createNotification` calls in the message / like / respond routes, exactly mirroring how those routes already publish to Ably. The service worker gains `push` + `notificationclick` handlers. The client subscribes via a home-screen banner and a Settings toggle. Absent `VAPID_*` env vars, every path is a silent no-op.

**Tech Stack:** Next.js 16 App Router (Route Handlers, `runtime = 'nodejs'`), Prisma 5 + Neon Postgres, `web-push` (new), Vitest + `prismaMock`, Tailwind v4, service worker (`public/sw.js`).

**Spec:** `docs/superpowers/specs/2026-08-28-web-push-notifications-design.md`

## Global Constraints

- Every Route Handler MUST `export const runtime = 'nodejs'` (CI test `runtime-enforcement.test.ts` fails otherwise).
- Every mutating route calls `verifyCsrf(req)` before anything else.
- No file in CLAUDE.md's protected list is touched. The **outbox dispatcher is NOT modified.**
- Optional-provider pattern: read `process.env.VAPID_*` directly at call sites (do NOT add to `src/lib/server/env.ts` — it deliberately skips optional providers). Absent env ⇒ silent no-op + one `log.warn`.
- Notification prefs stay **opt-out** (D-10): missing event ⇒ enabled. The new `push` channel follows the same rule.
- `sendPushToUser` **never throws** and is always called as `void sendPushToUser(...)`.
- A push send returning HTTP **404 or 410** deletes that `PushSubscription` row.
- The public VAPID key is served by `GET /api/push/vapid-public-key` (not `NEXT_PUBLIC_*`). The private key never reaches the client.
- Notification icon/badge path: `/pwa/icon/192` (existing dynamic PNG route).
- Before committing any task: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must all pass.
- Conventional Commits. Commit at the end of each task.

---

## File Structure

**New files:**
| Path | Responsibility |
|---|---|
| `frontend/prisma/migrations/20260828120000_push_subscriptions/migration.sql` | Create `PushSubscription` table |
| `frontend/src/lib/server/push/index.ts` | `isPushConfigured()`, `sendPushToUser()` — the only `web-push` caller |
| `frontend/src/lib/server/push/index.test.ts` | Unit tests for the above |
| `frontend/src/app/api/push/vapid-public-key/route.ts` | `GET` → `{ publicKey: string \| null }` |
| `frontend/src/app/api/push/vapid-public-key/route.test.ts` | — |
| `frontend/src/app/api/push/subscribe/route.ts` | `POST` (upsert) + `DELETE` (scoped) a subscription |
| `frontend/src/app/api/push/subscribe/route.test.ts` | — |
| `frontend/src/lib/yeoyo/platform.ts` | `isIos()`, `isStandalone()` — extracted from `usePwaInstall.ts` |
| `frontend/src/lib/yeoyo/usePushNotifications.ts` | Client hook: state machine + `enable()` / `disable()` |

**Modified files:**
| Path | Change |
|---|---|
| `frontend/prisma/schema.prisma` | `PushSubscription` model + `User.pushSubscriptions` back-relation |
| `frontend/package.json` | add `web-push` + `@types/web-push` |
| `frontend/src/lib/server/notifications/prefs-merge.ts` | widen channel union to include `'push'` |
| `frontend/src/lib/server/notifications/prefs-merge.test.ts` | `push` channel cases |
| `frontend/src/app/api/notifications/prefs/route.ts` | `push` in the `ChannelPrefs` zod object |
| `frontend/public/sw.js` | `push` + `notificationclick` listeners |
| `frontend/src/lib/yeoyo/usePwaInstall.ts` | import `isIos`/`isStandalone` from `platform.ts` |
| `frontend/src/app/api/conversations/[id]/messages/route.ts` | push on new message |
| `frontend/src/app/api/contact-requests/[id]/respond/route.ts` | push on accept |
| `frontend/src/app/api/likes/route.ts` | push on mutual match + new request |
| `frontend/src/app/app/decouvrir/page.tsx` | enable-push banner (sidebar) |
| `frontend/src/app/app/parametres/notifications/page.tsx` | push master toggle section |
| `.env.example` | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` |
| `README.md` | env table row for push |

---

## Task 1: `PushSubscription` model + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create: `frontend/prisma/migrations/20260828120000_push_subscriptions/migration.sql`

**Interfaces:**
- Produces: Prisma model `PushSubscription { id, userId, endpoint (unique), p256dh, auth, userAgent?, createdAt }`; `prisma.pushSubscription` delegate available to later tasks.

- [ ] **Step 1: Add the model to `schema.prisma`**

Add at the end of the file (after the last model), and add the back-relation to `User`:

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  endpoint  String   @unique
  p256dh    String
  auth      String
  userAgent String?
  createdAt DateTime @default(now())

  @@index([userId])
}
```

In `model User { ... }`, add alongside the other back-relations:

```prisma
  pushSubscriptions PushSubscription[]
```

- [ ] **Step 2: Hand-write the migration SQL**

Create `frontend/prisma/migrations/20260828120000_push_subscriptions/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `pnpm --filter frontend exec prisma generate`
Expected: "Generated Prisma Client" with no error.

- [ ] **Step 4: Apply to the dev database**

Run: `pnpm --filter frontend exec prisma migrate deploy`
Expected: "1 migration found" / "Applying migration `20260828120000_push_subscriptions`" / "The following migration(s) have been applied". (If the dev DB is already ahead, `pnpm db:push` instead.)

- [ ] **Step 5: Verify typecheck sees the new delegate**

Run: `pnpm typecheck`
Expected: PASS (no errors). This confirms `prisma.pushSubscription` is typed.

- [ ] **Step 6: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/20260828120000_push_subscriptions
git commit -m "feat(push): add PushSubscription model + migration"
```

---

## Task 2: `push` channel in notification preferences

**Files:**
- Modify: `frontend/src/lib/server/notifications/prefs-merge.ts`
- Modify: `frontend/src/lib/server/notifications/prefs-merge.test.ts`
- Modify: `frontend/src/app/api/notifications/prefs/route.ts:24-27` (the `ChannelPrefs` zod object)

**Interfaces:**
- Consumes: existing `isChannelEnabled(prefs, eventType, channel)`, `mergePrefs`, `parsePrefs`.
- Produces: `isChannelEnabled(prefs, eventType, 'push')` is now type-valid and defaults to `true`.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/server/notifications/prefs-merge.test.ts` inside the existing `describe('isChannelEnabled', ...)` block (or a new one if none exists):

```ts
describe('isChannelEnabled — push channel', () => {
  it('defaults push to enabled when the event has no override (opt-out)', () => {
    expect(isChannelEnabled({}, 'MESSAGE_RECEIVED', 'push')).toBe(true);
    expect(isChannelEnabled({ MESSAGE_RECEIVED: { inApp: false } }, 'MESSAGE_RECEIVED', 'push')).toBe(
      true,
    );
  });

  it('respects an explicit push:false without touching inApp', () => {
    const prefs = { MESSAGE_RECEIVED: { push: false, inApp: true } };
    expect(isChannelEnabled(prefs, 'MESSAGE_RECEIVED', 'push')).toBe(false);
    expect(isChannelEnabled(prefs, 'MESSAGE_RECEIVED', 'inApp')).toBe(true);
  });

  it('mergePrefs keeps push alongside a partial email override', () => {
    const out = mergePrefs({ MESSAGE_RECEIVED: { push: false } }, { MESSAGE_RECEIVED: { email: false } });
    expect(out).toEqual({ MESSAGE_RECEIVED: { push: false, email: false } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/notifications/prefs-merge.test.ts`
Expected: FAIL — TypeScript error `Argument of type '"push"' is not assignable to parameter of type '"email" | "inApp"'`.

- [ ] **Step 3: Widen the channel type in `prefs-merge.ts`**

Change the two type declarations near the top:

```ts
export type ChannelPrefs = { email?: boolean; inApp?: boolean; push?: boolean };
```

And in `isChannelEnabled`'s signature:

```ts
export function isChannelEnabled(
  prefs: NotificationPrefs | null | undefined,
  eventType: string,
  channel: 'email' | 'inApp' | 'push',
): boolean {
```

`mergePrefs`' body is generic over channel keys already — no change to its logic.

- [ ] **Step 4: Add `push` to the API's zod validator**

In `frontend/src/app/api/notifications/prefs/route.ts`, the `ChannelPrefs` object:

```ts
const ChannelPrefs = z.object({
  email: z.boolean().optional(),
  inApp: z.boolean().optional(),
  push: z.boolean().optional(),
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/lib/server/notifications/prefs-merge.test.ts src/app/api/notifications/prefs/route.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/notifications/prefs-merge.ts frontend/src/lib/server/notifications/prefs-merge.test.ts frontend/src/app/api/notifications/prefs/route.ts
git commit -m "feat(push): add push channel to notification preferences"
```

---

## Task 3: Server push module (`lib/server/push`)

**Files:**
- Modify: `frontend/package.json` (deps)
- Create: `frontend/src/lib/server/push/index.ts`
- Create: `frontend/src/lib/server/push/index.test.ts`

**Interfaces:**
- Consumes: `PrismaClient` (`prisma.pushSubscription`), `createLogger` from `@/lib/server/logger`.
- Produces:
  - `isPushConfigured(): boolean`
  - `sendPushToUser(prisma: PrismaClient, userId: string, payload: PushPayload): Promise<void>` — never throws
  - `type PushPayload = { title: string; body: string; url: string; tag?: string }`

- [ ] **Step 1: Install `web-push`**

Run: `pnpm --filter frontend add web-push && pnpm --filter frontend add -D @types/web-push`
Expected: both added to `frontend/package.json`, lockfile updated.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/lib/server/push/index.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prismaMock } from '@/test-utils/prisma-mock';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

import { isPushConfigured, sendPushToUser } from './index';

const ENV = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ENV };
});
afterEach(() => {
  process.env = { ...ENV };
});

function configureVapid() {
  process.env.VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';
  process.env.VAPID_SUBJECT = 'mailto:x@y.z';
}

describe('isPushConfigured', () => {
  it('false when any VAPID var is missing', () => {
    delete process.env.VAPID_PUBLIC_KEY;
    expect(isPushConfigured()).toBe(false);
  });
  it('true when all three are set', () => {
    configureVapid();
    expect(isPushConfigured()).toBe(true);
  });
});

describe('sendPushToUser', () => {
  it('no-ops (no DB call) when push is not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    await sendPushToUser(prismaMock as never, 'u1', { title: 't', body: 'b', url: '/app' });
    expect(prismaMock.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('sends one notification per subscription', async () => {
    configureVapid();
    prismaMock.pushSubscription.findMany.mockResolvedValueOnce([
      { endpoint: 'e1', p256dh: 'a', auth: 'b' },
      { endpoint: 'e2', p256dh: 'c', auth: 'd' },
    ] as never);
    sendNotification.mockResolvedValue(undefined);
    await sendPushToUser(prismaMock as never, 'u1', { title: 't', body: 'b', url: '/app/messages/1' });
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('deletes a subscription that returns 410 Gone', async () => {
    configureVapid();
    prismaMock.pushSubscription.findMany.mockResolvedValueOnce([
      { endpoint: 'dead', p256dh: 'a', auth: 'b' },
    ] as never);
    sendNotification.mockRejectedValueOnce({ statusCode: 410 });
    await sendPushToUser(prismaMock as never, 'u1', { title: 't', body: 'b', url: '/app' });
    expect(prismaMock.pushSubscription.delete).toHaveBeenCalledWith({ where: { endpoint: 'dead' } });
  });

  it('swallows a 500 and does not throw or delete', async () => {
    configureVapid();
    prismaMock.pushSubscription.findMany.mockResolvedValueOnce([
      { endpoint: 'e1', p256dh: 'a', auth: 'b' },
    ] as never);
    sendNotification.mockRejectedValueOnce({ statusCode: 500 });
    await expect(
      sendPushToUser(prismaMock as never, 'u1', { title: 't', body: 'b', url: '/app' }),
    ).resolves.toBeUndefined();
    expect(prismaMock.pushSubscription.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/push/index.test.ts`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 4: Implement `frontend/src/lib/server/push/index.ts`**

```ts
import 'server-only';
import webpush from 'web-push';
import type { PrismaClient } from '@prisma/client';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export function isPushConfigured(): boolean {
  return (
    !!process.env.VAPID_PUBLIC_KEY &&
    !!process.env.VAPID_PRIVATE_KEY &&
    !!process.env.VAPID_SUBJECT
  );
}

let vapidReady = false;
function ensureVapid(): void {
  if (vapidReady) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
  vapidReady = true;
}

let warnedUnconfigured = false;

/**
 * Fire a Web Push to every browser `userId` has subscribed. Never throws —
 * callers use `void sendPushToUser(...)`. Subscriptions that the push
 * service reports as gone (404/410) are deleted.
 */
export async function sendPushToUser(
  prisma: PrismaClient,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!isPushConfigured()) {
    if (!warnedUnconfigured) {
      log.warn('push: VAPID_* not configured — web push is inert');
      warnedUnconfigured = true;
    }
    return;
  }

  let subs: { endpoint: string; p256dh: string; auth: string }[];
  try {
    subs = await prisma.pushSubscription.findMany({
      where: { userId },
      select: { endpoint: true, p256dh: true, auth: true },
    });
  } catch (err) {
    log.warn('push: failed to load subscriptions', { error: err, userId });
    return;
  }
  if (subs.length === 0) return;

  ensureVapid();
  const body = JSON.stringify(payload);

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription
            .delete({ where: { endpoint: s.endpoint } })
            .catch(() => undefined);
        } else {
          log.warn('push: send failed', { error: err, userId, statusCode });
        }
      }
    }),
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/lib/server/push/index.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Full gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS.

```bash
git add frontend/package.json frontend/pnpm-lock.yaml ../pnpm-lock.yaml frontend/src/lib/server/push
git commit -m "feat(push): web-push server module with self-healing subscriptions"
```

---

## Task 4: `GET /api/push/vapid-public-key`

**Files:**
- Create: `frontend/src/app/api/push/vapid-public-key/route.ts`
- Create: `frontend/src/app/api/push/vapid-public-key/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `isPushConfigured` from `@/lib/server/push`.
- Produces: `GET` → `200 { publicKey: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/push/vapid-public-key/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockAuth = vi.mocked(requireAuth);
const ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ENV };
  mockAuth.mockResolvedValue({ user: { sub: 'u1', email: 'u1@test.local' } } as never);
});

function req() {
  return new NextRequest('http://test/api/push/vapid-public-key');
}

describe('GET /api/push/vapid-public-key', () => {
  it('401s when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await GET(req())).status).toBe(401);
  });

  it('returns the key when configured', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    process.env.VAPID_SUBJECT = 'mailto:x@y.z';
    const body = await (await GET(req())).json();
    expect(body.publicKey).toBe('pub');
  });

  it('returns null when not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const body = await (await GET(req())).json();
    expect(body.publicKey).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/push/vapid-public-key/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/push/vapid-public-key/route.ts`:

```ts
// GET /api/push/vapid-public-key — the client needs the public VAPID key to
// call pushManager.subscribe(). Served here (not NEXT_PUBLIC_*) so a key
// rotation needs no rebuild and "is push configured" has one server-side
// source of truth. Returns null when push is not configured.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { isPushConfigured } from '@/lib/server/push';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    return NextResponse.json(
      { publicKey: isPushConfigured() ? (process.env.VAPID_PUBLIC_KEY as string) : null },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/push/vapid-public-key/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/push/vapid-public-key
git commit -m "feat(push): GET /api/push/vapid-public-key"
```

---

## Task 5: `POST` / `DELETE /api/push/subscribe`

**Files:**
- Create: `frontend/src/app/api/push/subscribe/route.ts`
- Create: `frontend/src/app/api/push/subscribe/route.test.ts`

**Interfaces:**
- Consumes: `verifyCsrf`, `requireAuth`, `prisma.pushSubscription`.
- Produces: `POST` → `201 { ok: true }` (upsert by `endpoint`); `DELETE` → `200 { ok: true }` (deleteMany scoped to caller).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/push/subscribe/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';

vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { POST, DELETE } from './route';

const mockCsrf = vi.mocked(verifyCsrf);
const mockAuth = vi.mocked(requireAuth);

beforeEach(() => {
  vi.clearAllMocks();
  mockCsrf.mockReturnValue(null);
  mockAuth.mockResolvedValue({ user: { sub: 'u1', email: 'u1@test.local' } } as never);
});

function post(body: unknown) {
  return new NextRequest('http://test/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'user-agent': 'jsdom' },
  });
}
function del(body: unknown) {
  return new NextRequest('http://test/api/push/subscribe', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/push/subscribe', () => {
  it('rejects when CSRF fails', async () => {
    mockCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    expect((await POST(post({}))).status).toBe(403);
  });

  it('400s on a malformed body', async () => {
    expect((await POST(post({ endpoint: 'e' }))).status).toBe(400);
  });

  it('upserts the subscription keyed on endpoint', async () => {
    prismaMock.pushSubscription.upsert.mockResolvedValueOnce({ id: 's1' } as never);
    const res = await POST(post({ endpoint: 'https://push/e1', keys: { p256dh: 'a', auth: 'b' } }));
    expect(res.status).toBe(201);
    expect(prismaMock.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { endpoint: 'https://push/e1' } }),
    );
  });
});

describe('DELETE /api/push/subscribe', () => {
  it('deletes only rows owned by the caller', async () => {
    prismaMock.pushSubscription.deleteMany.mockResolvedValueOnce({ count: 1 } as never);
    const res = await DELETE(del({ endpoint: 'https://push/e1' }));
    expect(res.status).toBe(200);
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://push/e1', userId: 'u1' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/push/subscribe/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/push/subscribe/route.ts`:

```ts
// POST /api/push/subscribe   — register (upsert) this browser's push endpoint.
// DELETE /api/push/subscribe — remove it (scoped to the caller).
// The client sends `PushSubscription.toJSON()` shape: { endpoint, keys:{p256dh,auth} }.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
const UnsubscribeBody = z.object({ endpoint: z.string().min(1) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = SubscribeBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'Invalid subscription' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { endpoint, keys } = parsed.data;
    const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 255) || null;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: auth.user.sub, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      update: { userId: auth.user.sub, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });

    return NextResponse.json(
      { ok: true },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = UnsubscribeBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'endpoint is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, userId: auth.user.sub },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/push/subscribe/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/push/subscribe
git commit -m "feat(push): POST/DELETE /api/push/subscribe"
```

---

## Task 6: Wire push into the message / respond / likes routes

**Files:**
- Modify: `frontend/src/app/api/conversations/[id]/messages/route.ts` (after the `createNotification` block, ~L261)
- Modify: `frontend/src/app/api/contact-requests/[id]/respond/route.ts` (after the ACCEPT `createNotification`, ~L152)
- Modify: `frontend/src/app/api/likes/route.ts` (both branches, ~L304 and ~L314)
- Modify: `frontend/src/app/api/conversations/[id]/messages/route.test.ts`
- Modify: `frontend/src/app/api/contact-requests/[id]/respond/route.test.ts`
- Modify: `frontend/src/app/api/likes/route.test.ts`

**Interfaces:**
- Consumes: `sendPushToUser` from `@/lib/server/push`, `isChannelEnabled` / `parsePrefs` (already imported in these files where prefs are read).

- [ ] **Step 1: Add push to the messages route**

In `frontend/src/app/api/conversations/[id]/messages/route.ts`, add the import:

```ts
import { sendPushToUser } from '@/lib/server/push';
```

Immediately after the existing `if (!isMutedBy(...) && isChannelEnabled(..., 'MESSAGE_RECEIVED', 'inApp')) { await createNotification(...) }` block, add:

```ts
if (
  !isMutedBy(conversation, recipientId) &&
  isChannelEnabled(parsePrefs(recipientPrefsRow?.prefs), 'MESSAGE_RECEIVED', 'push')
) {
  void sendPushToUser(prisma, recipientId, {
    title: `Nouveau message de ${senderProfile?.firstName ?? 'Quelqu’un'}`,
    body: (message.body || '📷 Photo').slice(0, 140),
    url: `/app/messages/${id}`,
    tag: `msg:${id}`,
  });
}
```

- [ ] **Step 2: Add push to the respond route (ACCEPT branch)**

In `frontend/src/app/api/contact-requests/[id]/respond/route.ts`, add the import `import { sendPushToUser } from '@/lib/server/push';`. After the `await createNotification(prisma, contactRequestAccepted(request.requesterId, id, conversationId, accepterProfile?.firstName ?? 'Quelqu’un'))` call, add:

```ts
void sendPushToUser(prisma, request.requesterId, {
  title: `C'est un match avec ${accepterProfile?.firstName ?? 'Quelqu’un'} !`,
  body: 'Ta demande a été acceptée — une conversation commence.',
  url: `/app/messages/${conversationId}`,
  tag: `match:${id}`,
});
```

(No `isChannelEnabled` gate here — matches the surrounding unconditional in-app match notification. A subscription must still exist for anything to send.)

- [ ] **Step 3: Add push to the likes route (both branches)**

In `frontend/src/app/api/likes/route.ts`, add the import. In the `if (result.matchedRequestId) { ... }` branch, after its `createNotification`:

```ts
void sendPushToUser(prisma, targetUserId, {
  title: `C'est un match avec ${likerProfile?.firstName ?? 'Quelqu’un'} !`,
  body: 'Vous pouvez maintenant discuter.',
  url: `/app/messages/${result.conversationId as string}`,
  tag: `match:${result.matchedRequestId}`,
});
```

In the `else if (isChannelEnabled(..., 'CONTACT_REQUEST', 'inApp'))` branch, after its `createNotification`, add a sibling guarded block:

```ts
if (isChannelEnabled(parsePrefs(targetPrefsRow?.prefs), 'CONTACT_REQUEST', 'push')) {
  void sendPushToUser(prisma, targetUserId, {
    title: `${likerProfile?.firstName ?? 'Quelqu’un'} s'intéresse à toi`,
    body: 'Une nouvelle demande de contact t’attend.',
    url: '/app/demandes',
    tag: `req:${result.contactRequest.id}`,
  });
}
```

- [ ] **Step 4: Extend the messages route test**

In `frontend/src/app/api/conversations/[id]/messages/route.test.ts`, add `vi.mock('@/lib/server/push', () => ({ sendPushToUser: vi.fn() }))` at the top with the other mocks, import the mock, and add one test:

```ts
it('fires a push to the recipient on a new message', async () => {
  // (reuse the existing "sends a message" happy-path setup)
  const { sendPushToUser } = await import('@/lib/server/push');
  // ...perform the successful POST as the existing happy-path test does...
  expect(vi.mocked(sendPushToUser)).toHaveBeenCalledWith(
    expect.anything(),
    RECIPIENT_ID,
    expect.objectContaining({ url: expect.stringContaining('/app/messages/') }),
  );
});
```

Match `RECIPIENT_ID` / setup to whatever the existing happy-path test in that file already uses (read it first).

- [ ] **Step 5: Extend the respond + likes route tests**

Same pattern: `vi.mock('@/lib/server/push', ...)`, then in each file's existing "accept → match" / "mutual match" / "new request" happy-path test, assert `sendPushToUser` was called with the expected `userId` and a `url`. Add a negative case in the likes "new request" test: set the target's prefs to `{ CONTACT_REQUEST: { push: false } }` and assert `sendPushToUser` was **not** called.

- [ ] **Step 6: Run the affected tests**

Run: `pnpm --filter frontend exec vitest run src/app/api/conversations/[id]/messages/route.test.ts src/app/api/contact-requests/[id]/respond/route.test.ts src/app/api/likes/route.test.ts`
Expected: PASS (all, including the new assertions).

- [ ] **Step 7: Full gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS.

```bash
git add frontend/src/app/api/conversations frontend/src/app/api/contact-requests frontend/src/app/api/likes
git commit -m "feat(push): send web push on message, match, and contact request"
```

---

## Task 7: Service worker `push` + `notificationclick` handlers

**Files:**
- Modify: `frontend/public/sw.js`

**Interfaces:**
- Consumes: push payloads shaped `{ title, body, url, tag }` (JSON) sent by `sendPushToUser`.

- [ ] **Step 1: Add the two listeners**

Append to `frontend/public/sw.js` (keep the existing `install` / `activate` / `fetch` blocks untouched):

```js
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
          client.focus();
          if ('navigate' in client) client.navigate(target);
          return undefined;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
```

- [ ] **Step 2: Verify the file is still valid JS**

Run: `pnpm --filter frontend exec node --check public/sw.js`
Expected: no output (exit 0).

- [ ] **Step 3: Manual smoke (documented, not automated)**

Note in the commit body: verified by DevTools → Application → Service Workers → "Push" test payload `{"title":"Test","body":"hi","url":"/app/messages"}` shows a notification, and clicking it focuses/opens `/app/messages`. (Full flow is covered in Task 11's UAT.)

- [ ] **Step 4: Commit**

```bash
git add frontend/public/sw.js
git commit -m "feat(push): service worker push + notificationclick handlers"
```

---

## Task 8: `platform.ts` + `usePushNotifications` hook

**Files:**
- Create: `frontend/src/lib/yeoyo/platform.ts`
- Modify: `frontend/src/lib/yeoyo/usePwaInstall.ts` (import `isIos`/`isStandalone` from `platform.ts`)
- Create: `frontend/src/lib/yeoyo/usePushNotifications.ts`

**Interfaces:**
- Produces:
  - `platform.ts`: `isIos(): boolean`, `isStandalone(): boolean`
  - `usePushNotifications(): { state: PushState; enable: () => Promise<void>; disable: () => Promise<void> }`
  - `type PushState = 'unsupported' | 'ios-needs-install' | 'unconfigured' | 'default' | 'granted' | 'denied'`

- [ ] **Step 1: Extract `platform.ts`**

Create `frontend/src/lib/yeoyo/platform.ts` with the two helpers currently inline in `usePwaInstall.ts`:

```ts
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
```

Then in `usePwaInstall.ts`: delete the local `isIos` and `isStandalone` function definitions and add
`import { isIos, isStandalone } from '@/lib/yeoyo/platform';`. Leave `isInAppBrowser` where it is.

- [ ] **Step 2: Verify nothing broke**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. `usePwaInstall` behaves identically.

- [ ] **Step 3: Implement `usePushNotifications.ts`**

Create `frontend/src/lib/yeoyo/usePushNotifications.ts`:

```ts
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

function urlBase64ToUint8Array(base64: string): Uint8Array {
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
```

- [ ] **Step 4: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS (no new tests — this is client glue; typecheck is the gate, full flow in Task 11).

```bash
git add frontend/src/lib/yeoyo/platform.ts frontend/src/lib/yeoyo/usePwaInstall.ts frontend/src/lib/yeoyo/usePushNotifications.ts
git commit -m "feat(push): usePushNotifications hook + shared platform helpers"
```

---

## Task 9: Enable-push banner on the home screen

**Files:**
- Modify: `frontend/src/app/app/decouvrir/page.tsx`

**Interfaces:**
- Consumes: `usePushNotifications` from `@/lib/yeoyo/usePushNotifications` (Task 8); `usePwaInstall` from `@/lib/yeoyo/usePwaInstall` (existing — used here for the `install` action on the iOS path).

- [ ] **Step 1: Add the banner constants + state**

Near the other banner dismiss keys in `decouvrir/page.tsx`:

```ts
const PUSH_BANNER_DISMISS_KEY = 'yeoyo-push-banner-dismissed-at';
```

In the component body, alongside the other banner state:

```ts
const { state: pushState, enable: enablePush } = usePushNotifications();
const { install: installPwa } = usePwaInstall();
const [pushBannerDismissed, setPushBannerDismissed] = useState(false);
const pushBannerExit = useCardExit();
```

In the existing `useEffect` that reads the other banner snoozes, add:

```ts
setPushBannerDismissed(isBannerSnoozed(PUSH_BANNER_DISMISS_KEY));
```

And a dismiss handler next to the others:

```ts
function dismissPushBanner() {
  snoozeBanner(PUSH_BANNER_DISMISS_KEY);
  setPushBannerDismissed(true);
}
```

- [ ] **Step 2: Render the banner in the sidebar**

Place it in the sidebar `<aside>` next to the Premium/Boost banners. Show only when not dismissed and `pushState` is `default` or `ios-needs-install`:

```tsx
{!pushBannerDismissed && (pushState === 'default' || pushState === 'ios-needs-install') && (
  <div className={`animate-fade-in-up relative ${pushBannerExit.exitClassName}`}>
    <div className="flex w-full items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 pr-10">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Icon name="bell" size={18} />
      </div>
      <div>
        <p className="font-headings text-sm font-semibold text-foreground">Active les notifications</p>
        {pushState === 'ios-needs-install' ? (
          <>
            <p className="font-body text-xs text-muted-foreground">
              Installe d’abord YeOyo sur ton écran d’accueil pour recevoir les alertes.
            </p>
            <button
              type="button"
              onClick={() => void installPwa()}
              className="mt-2 rounded-lg bg-primary px-3 py-1.5 font-body text-xs font-semibold text-primary-foreground"
            >
              Installer YeOyo
            </button>
          </>
        ) : (
          <>
            <p className="font-body text-xs text-muted-foreground">
              Sois prévenu·e dès qu’on t’écrit ou qu’on accepte ton match.
            </p>
            <button
              type="button"
              onClick={() => void enablePush()}
              className="mt-2 rounded-lg bg-primary px-3 py-1.5 font-body text-xs font-semibold text-primary-foreground"
            >
              Activer
            </button>
          </>
        )}
      </div>
    </div>
    <button
      type="button"
      onClick={() => pushBannerExit.trigger('left', dismissPushBanner)}
      aria-label="Fermer — me le rappeler plus tard"
      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
    >
      <Icon name="x" size={12} />
    </button>
  </div>
)}
```

Add the imports at the top of the file:

```ts
import { usePushNotifications } from '@/lib/yeoyo/usePushNotifications';
import { usePwaInstall } from '@/lib/yeoyo/usePwaInstall';
```

- [ ] **Step 3: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS.

```bash
git add frontend/src/app/app/decouvrir/page.tsx
git commit -m "feat(push): enable-notifications banner on the home screen"
```

---

## Task 10: Push master toggle in Settings → Notifications

**Files:**
- Modify: `frontend/src/app/app/parametres/notifications/page.tsx`

**Interfaces:**
- Consumes: `usePushNotifications`.

- [ ] **Step 1: Add a push section above the per-event list**

Add the import `import { usePushNotifications } from '@/lib/yeoyo/usePushNotifications';` and in the component:

```ts
const { state: pushState, enable: enablePush, disable: disablePush } = usePushNotifications();
```

Render a new `SettingsSection` before the existing one:

```tsx
<SettingsSection title="Notifications push (cet appareil)">
  <SettingsRow
    label="Recevoir les notifications sur cet appareil"
    helper={
      pushState === 'denied'
        ? 'Tu as bloqué les notifications — réactive-les dans les réglages de ton navigateur.'
        : pushState === 'ios-needs-install'
          ? 'Installe d’abord YeOyo sur ton écran d’accueil.'
          : pushState === 'unconfigured' || pushState === 'unsupported'
            ? 'Non disponible sur ce navigateur.'
            : 'Message, match accepté, nouvelle demande de contact.'
    }
  >
    <Toggle
      label="Notifications push"
      checked={pushState === 'granted'}
      disabled={pushState !== 'granted' && pushState !== 'default'}
      onChange={(v) => void (v ? enablePush() : disablePush())}
    />
  </SettingsRow>
</SettingsSection>
```

- [ ] **Step 2: Gate + commit**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS.

```bash
git add frontend/src/app/app/parametres/notifications/page.tsx
git commit -m "feat(push): push master toggle in notification settings"
```

---

## Task 11: Docs, env reference, and end-to-end verification

**Files:**
- Modify: `.env.example`
- Modify: `README.md` (optional-providers env table)

- [ ] **Step 1: Add the VAPID vars to `.env.example`**

In the OPTIONAL providers section:

```bash
# ── Web Push (browser/OS notifications) ──────────────────────────────────
# Generate once with:  pnpm --filter frontend exec web-push generate-vapid-keys
# Absent  →  push is inert (no banner, no OS notifications); the app is
# otherwise unaffected. The public key is served to the client by
# GET /api/push/vapid-public-key.
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
# Contact URL or mailto: identifying the sender to push services.
VAPID_SUBJECT="mailto:contact@yeoyo.app"
```

- [ ] **Step 2: Add a README row**

In the "Groupes optionnels" table in `README.md`:

```markdown
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `GET /api/push/vapid-public-key` renvoie `null`, la bannière d'activation ne s'affiche pas, aucune notification OS n'est envoyée — le reste de l'app est inchangé |
```

- [ ] **Step 3: Full gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all PASS.

- [ ] **Step 4: Manual UAT (document the result in the commit body)**

Prereq: set `VAPID_*` in `.env.local` (generate with the command above), `pnpm dev`.

1. Desktop Chrome: open `/app/decouvrir` → the "Active les notifications" banner shows → click **Activer** → browser permission prompt → accept. Banner disappears. `Settings → Notifications` shows the master toggle ON. Check DB: one `PushSubscription` row for your user.
2. From a second account, send a message to account 1. Background/minimize account 1's tab → OS notification "Nouveau message de …" appears → click it → the tab focuses and navigates to the conversation.
3. Second account sends a contact request to account 1 → OS notification "… s'intéresse à toi" → click → `/app/demandes`.
4. Account 1 accepts a pending request from account 2 → account 2 (backgrounded) gets "C'est un match avec …" → click → the conversation.
5. `Settings → Notifications` → toggle push OFF → `PushSubscription` row deleted; further events send no OS notification.
6. iPhone Safari (not installed): banner shows "Installe d'abord YeOyo…" + install button, no "Activer".
7. Unset `VAPID_*`, restart: no banner anywhere, app fully functional, `GET /api/push/vapid-public-key` → `{ publicKey: null }`.

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md
git commit -m "docs(push): VAPID env reference + UAT results"
```

---

## Self-Review Notes (author)

- **Spec coverage:** §3 model → T1. §4 env → T3/T11. §5.1 push module → T3. §5.2 prefs channel → T2. §6.1 vapid-key route → T4. §6.2/6.3 subscribe route → T5. §7 dispatch points → T6. §8 service worker → T7. §9.1 hook + platform.ts → T8. §9.2 home banner → T9. §9.3 settings toggle → T10. §10 master-vs-per-event rule → enforced by T5 (subscription = master) + T6 (`isChannelEnabled` per event) + T10 (toggle deletes subscription, writes no prefs). §11 testing → per-task test steps + T11 UAT. §12 file list → File Structure table.
- **No per-event push UI** is built (spec §10, §13) — intentional; `push` channel plumbing (T2) is in place for a v2.
- **Type consistency:** `sendPushToUser(prisma, userId, { title, body, url, tag? })` and `PushState` union are used identically in T3/T6/T8/T9/T10. `PushSubscription` fields (`endpoint`, `p256dh`, `auth`, `userAgent`) consistent T1/T3/T5.
- **Protected files:** none touched (outbox dispatcher untouched — push is inline, per spec §2).
