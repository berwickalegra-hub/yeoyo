# Message Flash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a man pay 3 credits to attach a personalized message to a contact request, visible to the target before she accepts — and, to support this cleanly, revert `POST /api/likes` so a `Conversation` only exists once a `ContactRequest` is genuinely `ACCEPTED` (or both sides have mutually liked each other).

**Architecture:** One additive nullable column (`ContactRequest.flashMessageBody`) carries the optional message. `POST /api/likes` stops eagerly creating a `Conversation`; it only creates one (plus attaches any stored flash message(s) as real `Message` rows) when the new like completes a mutual match. `POST /api/contact-requests/[id]/respond`'s ACCEPT branch becomes the other (more common) place a `Conversation` gets created, and attaches a stored flash message there too. A new bottom-sheet UI component on the swipe card lets a man opt into paying for the flash send.

**Tech Stack:** Next.js 16 App Router Route Handlers, Prisma 5 (Postgres), Zod, Vitest + vitest-mock-extended, React/Tailwind v4 client components.

**Spec:** `docs/superpowers/specs/2026-08-27-message-flash-design.md`

## Global Constraints

- Money/credits stay integer, never a float (`lib/server/credits/ledger.ts`).
- Every Route Handler keeps `export const runtime = 'nodejs'`.
- Every mutating route calls `verifyCsrf(req)` first.
- `spendCredits`/`grantCredits` remain the only choke points for credit-balance mutation — no direct `user.creditBalance` writes anywhere new.
- No file in CLAUDE.md's protected list is touched by this feature.
- Message Flash costs 3 credits, charged at send time, non-refundable if the request is later declined or never answered.
- A conversation only becomes usable once the underlying `ContactRequest` is `ACCEPTED` — applies to every contact request now, not just flash ones. Exception: a mutual like (both sides have already liked each other) auto-accepts both requests and creates the conversation immediately.
- A flash message, once its request is accepted (or matched), becomes the conversation's real first `Message` — not a preview, a real message the recipient can reply to.
- The existing "first message costs 1 credit, men only" rule (`computeFirstMessageCost`) must never double-charge on top of a flash message — this holds automatically because the flash message becomes message #1, so `messageCount === 0` naturally evaluates false for anything after it.

---

## Task 1: Data model — `flashMessageBody` column + credit cost constant

**Files:**
- Modify: `frontend/prisma/schema.prisma` (the `ContactRequest` model, ~line 496-511; the `Conversation` model's header comment, ~line 513-520)
- Create: `frontend/prisma/migrations/20260827120000_flash_message_body/migration.sql`
- Modify: `frontend/src/lib/server/credits/ledger.ts` (`CREDIT_COSTS` object, ~line 31-36)

**Interfaces:**
- Produces: `ContactRequest.flashMessageBody: string | null` (available on every Prisma Client return of a `ContactRequest` row from this task onward — every later task relies on this field existing after `prisma generate`). Produces: `CREDIT_COSTS.flash_message === 3`, consumed by `spendCredits(tx, { action: 'flash_message', ... })` in Task 2.

- [ ] **Step 1: Add the column to the Prisma schema**

Open `frontend/prisma/schema.prisma` and find the `ContactRequest` model:

```prisma
model ContactRequest {
  id          String   @id @default(cuid())
  requesterId String
  requester   User     @relation("ContactRequestsSent", fields: [requesterId], references: [id], onDelete: Cascade)
  targetId    String
  target      User     @relation("ContactRequestsReceived", fields: [targetId], references: [id], onDelete: Cascade)
  status      String   @default("PENDING") // PENDING | VIEWED | ACCEPTED | CANCELLED
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  conversation Conversation?

  @@unique([requesterId, targetId])
  @@index([targetId, status])
  @@index([requesterId, status])
}
```

Add the new field right after `status`:

```prisma
model ContactRequest {
  id          String   @id @default(cuid())
  requesterId String
  requester   User     @relation("ContactRequestsSent", fields: [requesterId], references: [id], onDelete: Cascade)
  targetId    String
  target      User     @relation("ContactRequestsReceived", fields: [targetId], references: [id], onDelete: Cascade)
  status      String   @default("PENDING") // PENDING | VIEWED | ACCEPTED | CANCELLED
  // Message Flash (2026-08-27) — optional personalized message attached at
  // request time, shown to the target before she accepts/declines. Becomes
  // the conversation's real first Message once the request is accepted or
  // auto-accepted via mutual match (see POST /api/likes and POST
  // /api/contact-requests/[id]/respond). Non-refundable if declined — the
  // 3-credit charge already happened at send time in POST /api/likes.
  flashMessageBody String? @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  conversation Conversation?

  @@unique([requesterId, targetId])
  @@index([targetId, status])
  @@index([requesterId, status])
}
```

Then update the stale `Conversation` model header comment right above it (currently claims eager creation, which stopped being true after Task 2/3 land):

```prisma
// ───────────────────────────────────────────────────────────────────────
// YeOyo domain — messaging (Phase D). A Conversation is created when a
// ContactRequest is ACCEPTED (see POST /api/contact-requests/[id]/respond),
// or immediately when a new like completes a mutual match (both sides have
// liked each other — see POST /api/likes). userAId/userBId are stored in
// canonical sorted-id order (see lib\server\conversations\lib.ts:orderedPair)
// so the unique constraint holds regardless of which side accepted, and
// lookups don't need an OR clause.
// ───────────────────────────────────────────────────────────────────────
```

- [ ] **Step 2: Hand-write the migration folder (non-interactive workaround)**

This environment has no TTY, so `prisma migrate dev` cannot be used. Create the folder and SQL file by hand, following the exact convention already used for every other migration this session (e.g. `frontend/prisma/migrations/20260815215453_add_profile_phone/migration.sql`, a single additive nullable column):

Create `frontend/prisma/migrations/20260827120000_flash_message_body/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "flashMessageBody" TEXT;
```

- [ ] **Step 3: Apply the migration and regenerate the Prisma Client**

Run from `frontend/`:

```bash
pnpm --filter frontend exec prisma migrate deploy
pnpm --filter frontend exec prisma generate
```

Expected: migration applies cleanly (no drift warnings), Prisma Client regenerates with `flashMessageBody` on the `ContactRequest` type.

- [ ] **Step 4: Add the credit cost constant**

In `frontend/src/lib/server/credits/ledger.ts`, extend `CREDIT_COSTS`:

```ts
export const CREDIT_COSTS = {
  view_visitors: 1,
  view_favorited_by: 1,
  boost: 3,
  first_message: 1,
  flash_message: 3,
} as const;
```

- [ ] **Step 5: Verify with typecheck**

Run: `pnpm --filter frontend run typecheck`
Expected: PASS — no code references `flashMessageBody` yet, so this step is purely confirming the schema/client/constant changes compile cleanly on their own.

- [ ] **Step 6: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/20260827120000_flash_message_body/migration.sql frontend/src/lib/server/credits/ledger.ts
git commit -m "feat(messaging): add ContactRequest.flashMessageBody + flash_message credit cost"
```

---

## Task 2: `POST /api/likes` — stop eager Conversation creation, accept an optional flash message

**Files:**
- Modify: `frontend/src/app/api/likes/route.ts` (the `POST` handler and its header comment; `DELETE` is unchanged)
- Modify: `frontend/src/app/api/likes/route.test.ts`

**Interfaces:**
- Consumes: `CREDIT_COSTS.flash_message`, `spendCredits(tx, { userId, action, role })` from Task 1 / `lib/server/credits/ledger.ts` (already exists, exports `SpendResult { ok, bypass, balance }`). `ContactRequest.flashMessageBody` from Task 1.
- Produces: `POST /api/likes` response shape becomes `{ likeId: string; contactRequestId: string; contactRequestStatus: string; conversationId: string | null }` — Task 6's frontend changes and Task 3 both read this contract (Task 3 is server-side and independent, but the frontend consumers in Task 6 depend on `conversationId` being nullable now).

- [ ] **Step 1: Replace the route's header comment**

Replace lines 1-20 of `frontend/src/app/api/likes/route.ts` with:

```ts
// POST /api/likes — like a profile. Per the Demandes screen's own explainer
// ("Tu likes un profil → Une demande de contact est envoyée automatiquement"),
// liking auto-creates a PENDING ContactRequest in the same transaction.
// Idempotent: liking twice returns the existing rows instead of erroring.
//
// Message Flash (2026-08-27): the caller may attach an optional
// `flashMessageBody` (3 credits, charged here, non-refundable). It's stored
// on the ContactRequest and only becomes a real Message once the request
// is accepted (POST /api/contact-requests/[id]/respond) or immediately if
// this like completes a mutual match (below).
//
// A Conversation is NOT created just because a request was sent (reverted
// 2026-08-27 — see docs/superpowers/specs/2026-08-27-message-flash-design.md
// for why the earlier "eager conversation" behavior was rolled back). It's
// created here only when the reverse side already has a PENDING request out
// to us (mutual match — both sides auto-accept, "it's a match" semantics),
// or later in POST /api/contact-requests/[id]/respond on an explicit ACCEPT.
//
// DELETE /api/likes — unlike a profile (retract). Removes the Like row and,
// if the auto-created ContactRequest is still PENDING, cancels it too — a
// user should be able to change their mind before the other side responds.
// An already-ACCEPTED request (they responded, a conversation exists) is
// left alone: unliking never deletes a conversation or messages already
// exchanged, only withdraws an unanswered request.
//
// GET /api/likes/received (sibling route) covers "who liked me".
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { isBlockedEitherWay } from '@/lib/server/blocks';
import { createNotification } from '@/lib/server/notifications';
import { contactRequestReceived, contactRequestAccepted } from '@/lib/server/notifications/templates';
import { isChannelEnabled, parsePrefs } from '@/lib/server/notifications/prefs-merge';
import { orderedPair } from '@/lib/server/conversations/lib';
import { contactRequestQuotaStatus } from '@/lib/server/contact-requests/quota';
import { spendCredits, CREDIT_COSTS } from '@/lib/server/credits/ledger';
```

(This adds `contactRequestAccepted` to the existing `templates` import and the new `spendCredits, CREDIT_COSTS` import — everything else in the import list is unchanged.)

- [ ] **Step 2: Replace the `Body` schema**

```ts
const Body = z.object({
  targetUserId: z.string(),
  flashMessageBody: z.string().trim().min(1).max(2000).optional(),
});
```

- [ ] **Step 3: Replace the whole `POST` function body**

Replace the entire existing `export async function POST(...)` block with:

```ts
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const json: unknown = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'targetUserId is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { targetUserId, flashMessageBody } = parsed.data;

    if (targetUserId === auth.user.sub) {
      return NextResponse.json(
        { code: 'CANNOT_LIKE_SELF', message: 'Cannot like your own profile' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const targetProfile = await prisma.profile.findUnique({ where: { userId: targetUserId } });
    if (!targetProfile || !targetProfile.onboardingCompletedAt) {
      return NextResponse.json(
        { code: 'PROFILE_NOT_FOUND', message: 'Target profile not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (await isBlockedEitherWay(auth.user.sub, targetUserId)) {
      return NextResponse.json(
        { code: 'PROFILE_NOT_FOUND', message: 'Target profile not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Quota only applies to a genuinely NEW request — re-liking a target
    // you've already requested (or un-liked and are re-requesting) is
    // idempotent via the upsert below and must never be blocked or double-
    // counted. This same "is it new" signal also gates the Message Flash
    // charge/attach below: a re-like never re-charges credits or overwrites
    // a previously-set flash message (see the route's header comment).
    const existingRequest = await prisma.contactRequest.findUnique({
      where: { requesterId_targetId: { requesterId: auth.user.sub, targetId: targetUserId } },
      select: { id: true },
    });
    const isNewRequest = !existingRequest;
    if (isNewRequest) {
      const quota = await contactRequestQuotaStatus(auth.user.sub);
      if (quota.limit !== null && (quota.remaining ?? 0) <= 0) {
        return NextResponse.json(
          {
            code: 'CONTACT_REQUEST_QUOTA_EXCEEDED',
            message:
              'Tu as atteint la limite de demandes de contact gratuites pour ce mois-ci. Réessaie le mois prochain.',
            quota: { remaining: quota.remaining, limit: quota.limit, resetAt: quota.resetAt },
          },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const { userAId, userBId } = orderedPair(auth.user.sub, targetUserId);
    const result = await prisma.$transaction(async (tx) => {
      if (isNewRequest && flashMessageBody) {
        const sender = await tx.user.findUnique({
          where: { id: auth.user.sub },
          select: { role: true },
        });
        const spend = await spendCredits(tx, {
          userId: auth.user.sub,
          action: 'flash_message',
          role: sender?.role,
        });
        if (!spend.ok) {
          return { ok: false as const, balance: spend.balance };
        }
      }

      const likeRow = await tx.like.upsert({
        where: { likerId_likedId: { likerId: auth.user.sub, likedId: targetUserId } },
        create: { likerId: auth.user.sub, likedId: targetUserId },
        update: {},
      });

      const contactRequestRow = await tx.contactRequest.upsert({
        where: { requesterId_targetId: { requesterId: auth.user.sub, targetId: targetUserId } },
        create: {
          requesterId: auth.user.sub,
          targetId: targetUserId,
          flashMessageBody: flashMessageBody ?? null,
        },
        // A previously-withdrawn (CANCELLED) request that gets re-liked
        // should go back to PENDING instead of staying stuck as cancelled.
        // Never touches flashMessageBody here — only `create` sets it, so a
        // re-like can't re-charge or overwrite a previously-attached flash.
        update: { status: 'PENDING' },
      });

      // Mutual match: the target already has a PENDING request out to us.
      // Checked inside the transaction (not before it) so a concurrent
      // request can't create the reverse row between a pre-transaction
      // check and this transaction's writes.
      const reverseRequest = await tx.contactRequest.findUnique({
        where: { requesterId_targetId: { requesterId: targetUserId, targetId: auth.user.sub } },
      });
      const mutualMatch = !!reverseRequest && reverseRequest.status === 'PENDING';

      if (!mutualMatch) {
        return {
          ok: true as const,
          like: likeRow,
          contactRequest: contactRequestRow,
          conversationId: null as string | null,
          matchedRequestId: null as string | null,
        };
      }

      const acceptedRow = await tx.contactRequest.update({
        where: { id: contactRequestRow.id },
        data: { status: 'ACCEPTED' },
      });
      await tx.contactRequest.update({
        where: { id: reverseRequest.id },
        data: { status: 'ACCEPTED' },
      });
      const conversationRow = await tx.conversation.create({
        data: { userAId, userBId, contactRequestId: contactRequestRow.id },
      });

      const flashSources: { senderId: string; body: string | null; createdAt: Date }[] = [
        {
          senderId: contactRequestRow.requesterId,
          body: contactRequestRow.flashMessageBody,
          createdAt: contactRequestRow.createdAt,
        },
        {
          senderId: reverseRequest.requesterId,
          body: reverseRequest.flashMessageBody,
          createdAt: reverseRequest.createdAt,
        },
      ];
      const orderedFlashSources = flashSources
        .filter((s): s is { senderId: string; body: string; createdAt: Date } => !!s.body)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      for (const source of orderedFlashSources) {
        await tx.message.create({
          data: { conversationId: conversationRow.id, senderId: source.senderId, body: source.body },
        });
      }
      if (orderedFlashSources.length > 0) {
        await tx.conversation.update({
          where: { id: conversationRow.id },
          data: { lastMessageAt: new Date() },
        });
      }

      return {
        ok: true as const,
        like: likeRow,
        contactRequest: acceptedRow,
        conversationId: conversationRow.id as string | null,
        matchedRequestId: reverseRequest.id as string | null,
      };
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          code: 'INSUFFICIENT_CREDITS',
          message: 'Solde de crédits insuffisant pour envoyer ce message flash.',
          balance: result.balance,
          cost: CREDIT_COSTS.flash_message,
        },
        { status: 402, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [likerProfile, targetPrefsRow] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: auth.user.sub }, select: { firstName: true } }),
      prisma.notificationPreferences.findUnique({
        where: { userId: targetUserId },
        select: { prefs: true },
      }),
    ]);

    if (result.matchedRequestId) {
      // Mutual match — the target's own earlier request just got
      // auto-accepted. Tell them it's a match, using the same
      // always-on (not preference-gated) notification convention as the
      // ACCEPT branch of POST /api/contact-requests/[id]/respond.
      await createNotification(
        prisma,
        contactRequestAccepted(
          targetUserId,
          result.matchedRequestId,
          result.conversationId as string,
          likerProfile?.firstName ?? 'Quelqu’un',
        ),
      );
    } else if (isChannelEnabled(parsePrefs(targetPrefsRow?.prefs), 'CONTACT_REQUEST', 'inApp')) {
      await createNotification(
        prisma,
        contactRequestReceived(
          targetUserId,
          result.contactRequest.id,
          likerProfile?.firstName ?? 'Quelqu’un',
        ),
      );
    }

    return NextResponse.json(
      {
        likeId: result.like.id,
        contactRequestId: result.contactRequest.id,
        contactRequestStatus: result.contactRequest.status,
        conversationId: result.conversationId,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

Leave the existing `export async function DELETE(...)` untouched.

- [ ] **Step 4: Run typecheck to confirm the rewrite compiles**

Run: `pnpm --filter frontend run typecheck`
Expected: PASS.

- [ ] **Step 5: Write the new/updated tests**

The existing test file already covers quota + core guards + DELETE (keep those `describe` blocks as-is — they don't reference `conversation.upsert` so they're unaffected). Add these new tests to `frontend/src/app/api/likes/route.test.ts`, and update the `beforeEach` block since `conversation.upsert` is no longer called in the non-match path (replace `prismaMock.conversation.upsert.mockResolvedValue(...)` with nothing — leave it unmocked, it'll return `undefined` by default from `vitest-mock-extended` and tests that don't reach that branch won't call it):

Remove this line from the existing `beforeEach`:
```ts
prismaMock.conversation.upsert.mockResolvedValue({ id: 'conv-1' } as never);
```

Add this new `describe` block at the end of the file:

```ts
describe('POST /api/likes — Message Flash + Conversation-on-accept-only', () => {
  it('a normal like (no flash) creates only Like+ContactRequest, no Conversation, conversationId null', async () => {
    prismaMock.contactRequest.findUnique
      .mockResolvedValueOnce(null) // existingRequest — new request
      .mockResolvedValueOnce(null); // reverseRequest — no mutual match
    prismaMock.contactRequest.upsert.mockResolvedValueOnce({
      id: 'cr-1',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'PENDING',
      flashMessageBody: null,
      createdAt: new Date(),
    } as never);

    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { conversationId: string | null };
    expect(body.conversationId).toBeNull();
    expect(prismaMock.conversation.create).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled(); // no flash → no role check → no spend
  });

  it('a flash like with sufficient credits charges 3 credits and stores flashMessageBody, still no Conversation', async () => {
    prismaMock.contactRequest.findUnique
      .mockResolvedValueOnce(null) // existingRequest — new request
      .mockResolvedValueOnce(null); // reverseRequest — no mutual match
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: 'USER' } as never) // role check before spend
      .mockResolvedValueOnce({ creditBalance: 2 } as never); // spendCredits' post-spend balance fetch
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 } as never); // CAS success
    prismaMock.creditTransaction.create.mockResolvedValueOnce({} as never);
    prismaMock.contactRequest.upsert.mockResolvedValueOnce({
      id: 'cr-1',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'PENDING',
      flashMessageBody: 'Salut, ton profil me plaît beaucoup !',
      createdAt: new Date(),
    } as never);

    const res = await POST(
      makePost({ targetUserId: 'target-1', flashMessageBody: 'Salut, ton profil me plaît beaucoup !' }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'me-1', creditBalance: { gte: 3 } },
      data: { creditBalance: { decrement: 3 } },
    });
    expect(prismaMock.contactRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ flashMessageBody: 'Salut, ton profil me plaît beaucoup !' }),
      }),
    );
    const body = (await res.json()) as { conversationId: string | null };
    expect(body.conversationId).toBeNull();
  });

  it('a flash like with insufficient credits creates nothing and returns 402', async () => {
    prismaMock.contactRequest.findUnique.mockResolvedValueOnce(null); // existingRequest — new request
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: 'USER' } as never) // role check
      .mockResolvedValueOnce({ creditBalance: 1 } as never); // spendCredits' balance fetch on failure
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 0 } as never); // CAS fails

    const res = await POST(makePost({ targetUserId: 'target-1', flashMessageBody: 'Coucou' }));
    expect(res.status).toBe(402);
    const body = (await res.json()) as { code: string; balance: number; cost: number };
    expect(body.code).toBe('INSUFFICIENT_CREDITS');
    expect(body.balance).toBe(1);
    expect(body.cost).toBe(3);
    expect(prismaMock.like.upsert).not.toHaveBeenCalled();
    expect(prismaMock.contactRequest.upsert).not.toHaveBeenCalled();
    expect(prismaMock.creditTransaction.create).not.toHaveBeenCalled();
  });

  it('mutual match: both requests flip to ACCEPTED, Conversation is created, flash messages inserted oldest-first', async () => {
    const olderCreatedAt = new Date('2026-08-20T10:00:00Z');
    const newerCreatedAt = new Date('2026-08-27T10:00:00Z');
    prismaMock.contactRequest.findUnique
      .mockResolvedValueOnce(null) // existingRequest — new request from me
      .mockResolvedValueOnce({
        id: 'reverse-req-1',
        requesterId: 'target-1',
        targetId: 'me-1',
        status: 'PENDING',
        flashMessageBody: 'Salut moi aussi !',
        createdAt: olderCreatedAt,
      } as never); // reverseRequest — mutual match, sent earlier, carried its own flash
    prismaMock.contactRequest.upsert.mockResolvedValueOnce({
      id: 'cr-new-1',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'PENDING',
      flashMessageBody: null,
      createdAt: newerCreatedAt,
    } as never);
    prismaMock.contactRequest.update.mockResolvedValueOnce({
      id: 'cr-new-1',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'ACCEPTED',
    } as never);
    prismaMock.conversation.create.mockResolvedValueOnce({ id: 'conv-new-1' } as never);

    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(201);
    expect(prismaMock.contactRequest.update).toHaveBeenCalledWith({
      where: { id: 'cr-new-1' },
      data: { status: 'ACCEPTED' },
    });
    expect(prismaMock.contactRequest.update).toHaveBeenCalledWith({
      where: { id: 'reverse-req-1' },
      data: { status: 'ACCEPTED' },
    });
    expect(prismaMock.conversation.create).toHaveBeenCalledWith({
      data: { userAId: 'me-1', userBId: 'target-1', contactRequestId: 'cr-new-1' },
    });
    // Only the reverse request carried a flash message — inserted once, from its own requester.
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.message.create).toHaveBeenCalledWith({
      data: { conversationId: 'conv-new-1', senderId: 'target-1', body: 'Salut moi aussi !' },
    });
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-new-1' },
      data: { lastMessageAt: expect.any(Date) },
    });
    const body = (await res.json()) as { conversationId: string | null };
    expect(body.conversationId).toBe('conv-new-1');
  });

  it('re-liking an existing PENDING request never re-charges or overwrites flashMessageBody', async () => {
    prismaMock.contactRequest.findUnique
      .mockResolvedValueOnce({ id: 'cr-existing' } as never) // existingRequest — NOT new
      .mockResolvedValueOnce(null); // reverseRequest — no mutual match
    prismaMock.contactRequest.upsert.mockResolvedValueOnce({
      id: 'cr-existing',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'PENDING',
      flashMessageBody: null,
      createdAt: new Date(),
    } as never);

    const res = await POST(
      makePost({ targetUserId: 'target-1', flashMessageBody: 'Nouveau message, ne devrait pas compter' }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled(); // no role check → no spend attempted
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.contactRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { status: 'PENDING' } }),
    );
  });
});
```

- [ ] **Step 6: Run the test file**

Run: `pnpm --filter frontend exec vitest run src/app/api/likes/route.test.ts`
Expected: all tests PASS (existing quota/core-guard/DELETE tests plus the 5 new ones above).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/api/likes/route.ts frontend/src/app/api/likes/route.test.ts
git commit -m "feat(messaging): POST /api/likes accepts a paid flash message, stops eager Conversation creation"
```

---

## Task 3: `POST /api/contact-requests/[id]/respond` — ACCEPT branch really creates the Conversation

**Files:**
- Modify: `frontend/src/app/api/contact-requests/[id]/respond/route.ts` (inside the existing `$transaction` block, between `conversation.upsert` and the FIRST_MATCH_BONUS logic)
- Modify: `frontend/src/app/api/contact-requests/[id]/respond/route.test.ts`

**Interfaces:**
- Consumes: `request.flashMessageBody` (the already-fetched `request` object at the top of the handler picks this up automatically post-Task-1 migration, no `select` change needed since it's a plain unfiltered `findUnique`).
- Produces: no change to this route's response shape or exported behavior other than: a stored flash message now lands as `Message` row #1 in the conversation.

- [ ] **Step 1: Insert the flash-message logic**

In `frontend/src/app/api/contact-requests/[id]/respond/route.ts`, find this block inside the transaction (current lines ~77-84):

```ts
    const { userAId, userBId } = orderedPair(request.requesterId, request.targetId);
    const { conversationId } = await prisma.$transaction(async (tx) => {
      await tx.contactRequest.update({ where: { id }, data: { status: 'ACCEPTED' } });
      const conversation = await tx.conversation.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        create: { userAId, userBId, contactRequestId: id },
        update: {},
      });

      // Affiliate first-match bonus — one-time-ever per referred FEMME,
```

Insert the flash-message insertion between the `conversation` upsert and the affiliate comment, so it reads:

```ts
    const { userAId, userBId } = orderedPair(request.requesterId, request.targetId);
    const { conversationId } = await prisma.$transaction(async (tx) => {
      await tx.contactRequest.update({ where: { id }, data: { status: 'ACCEPTED' } });
      const conversation = await tx.conversation.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        create: { userAId, userBId, contactRequestId: id },
        update: {},
      });

      // Message Flash (2026-08-27) — a stored flash message becomes the
      // conversation's real first Message once the request is accepted.
      // Sets lastMessageAt too, same as a normal POST /messages send, so
      // this conversation sorts correctly in the Messages list.
      if (request.flashMessageBody) {
        await tx.message.create({
          data: {
            conversationId: conversation.id,
            senderId: request.requesterId,
            body: request.flashMessageBody,
          },
        });
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        });
      }

      // Affiliate first-match bonus — one-time-ever per referred FEMME,
```

Everything below (the FIRST_MATCH_BONUS block through `return { conversationId: conversation.id };`) stays exactly as-is, unmodified.

- [ ] **Step 2: Run the existing test suite to confirm no regression**

Run: `pnpm --filter frontend exec vitest run "src/app/api/contact-requests/[id]/respond/route.test.ts"`
Expected: all 8 existing FIRST_MATCH_BONUS tests still PASS unmodified — none of them set `flashMessageBody` on the mocked `contactRequest.findUnique` return value, so `request.flashMessageBody` is `undefined` in every existing test and the new `if` block never fires.

- [ ] **Step 3: Add new tests for the flash-message insertion**

Add this `describe` block to `frontend/src/app/api/contact-requests/[id]/respond/route.test.ts`:

```ts
describe('POST /api/contact-requests/[id]/respond — flash message becomes Message #1', () => {
  it('inserts the stored flashMessageBody as the conversation first Message on ACCEPT', async () => {
    prismaMock.contactRequest.findUnique.mockResolvedValue({
      id: 'req_1',
      requesterId: REQUESTER_ID,
      targetId: ACCEPTER_ID,
      status: 'PENDING',
      flashMessageBody: 'Salut, j’aimerais faire connaissance !',
    } as never);
    prismaMock.conversation.upsert.mockResolvedValueOnce({ id: 'conv_1' } as never);

    await POST(makePost('req_1', { action: 'ACCEPT' }), ctxWith('req_1'));

    expect(prismaMock.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conv_1',
        senderId: REQUESTER_ID,
        body: 'Salut, j’aimerais faire connaissance !',
      },
    });
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv_1' },
      data: { lastMessageAt: expect.any(Date) },
    });
  });

  it('creates no Message when the request has no flashMessageBody', async () => {
    prismaMock.contactRequest.findUnique.mockResolvedValue({
      id: 'req_1',
      requesterId: REQUESTER_ID,
      targetId: ACCEPTER_ID,
      status: 'PENDING',
      flashMessageBody: null,
    } as never);
    prismaMock.conversation.upsert.mockResolvedValueOnce({ id: 'conv_1' } as never);

    await POST(makePost('req_1', { action: 'ACCEPT' }), ctxWith('req_1'));

    expect(prismaMock.message.create).not.toHaveBeenCalled();
    expect(prismaMock.conversation.update).not.toHaveBeenCalled();
  });
});
```

Note: this file's existing `beforeEach` already sets `prismaMock.contactRequest.findUnique.mockResolvedValue({ id: 'req_1', requesterId: REQUESTER_ID, targetId: ACCEPTER_ID, status: 'PENDING' })` (no `flashMessageBody` key) — both new tests above explicitly override it with their own `mockResolvedValue` call before invoking `POST`, so they don't depend on that default.

- [ ] **Step 4: Run the full test file again**

Run: `pnpm --filter frontend exec vitest run "src/app/api/contact-requests/[id]/respond/route.test.ts"`
Expected: 10 tests PASS (8 existing FIRST_MATCH_BONUS + 2 new).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/contact-requests/[id]/respond/route.ts" "frontend/src/app/api/contact-requests/[id]/respond/route.test.ts"
git commit -m "feat(messaging): ACCEPT branch inserts a stored flash message as the conversation's first Message"
```

---

## Task 4: Regression test — no double-charge on a flash-originated conversation's next message

**Files:**
- Create: `frontend/src/app/api/conversations/[id]/messages/route.test.ts` (this route currently has zero test coverage)

**Interfaces:**
- Consumes: `POST`/`GET` from `frontend/src/app/api/conversations/[id]/messages/route.ts` (unmodified by this plan — this task only adds test coverage for existing, already-correct logic, proving the flash-message interaction is safe).

- [ ] **Step 1: Write the test file**

Create `frontend/src/app/api/conversations/[id]/messages/route.test.ts`:

```ts
// GET/POST /api/conversations/[id]/messages — this route had zero test
// coverage before Message Flash (2026-08-27). Added now specifically to
// prove computeFirstMessageCost's existing messageCount===0 check can't
// double-charge on top of a flash message: because a flash message lands
// as the conversation's Message #1 (see POST /api/contact-requests/[id]/
// respond and POST /api/likes' mutual-match branch), by the time a man
// sends his own first line through THIS route, messageCount is already 1
// — the exact same code path as "not the first message in any ordinary
// conversation", no special-casing needed.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/blocks', () => ({
  isBlockedEitherWay: vi.fn(() => false),
}));
vi.mock('@/lib/server/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

import { requireAuth } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const MAN_ID = 'man-1';
const WOMAN_ID = 'woman-1';
const CONVERSATION_ID = 'conv-1';

function makePost(body: unknown): NextRequest {
  return new NextRequest(`http://test/api/conversations/${CONVERSATION_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function ctx(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: CONVERSATION_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(undefined);
  });
  prismaMock.conversation.findUnique.mockResolvedValue({
    id: CONVERSATION_ID,
    userAId: MAN_ID,
    userBId: WOMAN_ID,
    mutedByUserA: false,
    mutedByUserB: false,
  } as never);
  prismaMock.notificationPreferences.findUnique.mockResolvedValue(null);
});

describe('POST /api/conversations/[id]/messages — first-message credit interaction', () => {
  it('charges 1 credit for a HOMME sending the true first message (messageCount 0)', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: MAN_ID, email: 'm@test.local' } });
    prismaMock.message.count.mockResolvedValueOnce(0);
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: 'USER', profile: { gender: 'HOMME' } } as never) // in-tx role/gender check
      .mockResolvedValueOnce({ creditBalance: 4 } as never); // spendCredits' post-spend balance
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.creditTransaction.create.mockResolvedValueOnce({} as never);
    prismaMock.message.create.mockResolvedValueOnce({
      id: 'msg-1',
      senderId: MAN_ID,
      body: 'Salut !',
      imageUpload: null,
      createdAt: new Date(),
    } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({ firstName: 'Jean' } as never);

    const res = await POST(makePost({ body: 'Salut !' }), ctx());

    expect(res.status).toBe(201);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: MAN_ID, creditBalance: { gte: 1 } },
      data: { creditBalance: { decrement: 1 } },
    });
  });

  it('does NOT charge a second credit for the man\'s next message once messageCount is 1 — the flash-originated-conversation case', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: MAN_ID, email: 'm@test.local' } });
    // messageCount is 1 here specifically because a flash message already
    // landed as Message #1 (Task 3's insertion) — from this route's own
    // point of view it's indistinguishable from any other non-empty
    // conversation, which is exactly the point of this test.
    prismaMock.message.count.mockResolvedValueOnce(1);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      role: 'USER',
      profile: { gender: 'HOMME' },
    } as never);
    prismaMock.message.create.mockResolvedValueOnce({
      id: 'msg-2',
      senderId: MAN_ID,
      body: 'Comment vas-tu ?',
      imageUpload: null,
      createdAt: new Date(),
    } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({ firstName: 'Jean' } as never);

    const res = await POST(makePost({ body: 'Comment vas-tu ?' }), ctx());

    expect(res.status).toBe(201);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.creditTransaction.create).not.toHaveBeenCalled();
  });

  it('never charges a FEMME sender regardless of messageCount', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: WOMAN_ID, email: 'w@test.local' } });
    prismaMock.message.count.mockResolvedValueOnce(0);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      role: 'USER',
      profile: { gender: 'FEMME' },
    } as never);
    prismaMock.message.create.mockResolvedValueOnce({
      id: 'msg-3',
      senderId: WOMAN_ID,
      body: 'Bonjour !',
      imageUpload: null,
      createdAt: new Date(),
    } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({ firstName: 'Awa' } as never);

    const res = await POST(makePost({ body: 'Bonjour !' }), ctx());

    expect(res.status).toBe(201);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('propagates 401 from requireAuth without touching the DB', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ body: 'Salut' }), ctx());
    expect(res.status).toBe(401);
    expect(prismaMock.conversation.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the new test file**

Run: `pnpm --filter frontend exec vitest run "src/app/api/conversations/[id]/messages/route.test.ts"`
Expected: 4 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/api/conversations/[id]/messages/route.test.ts"
git commit -m "test(messaging): cover first-message credit charge, including the flash-originated no-double-charge case"
```

---

## Task 5: Frontend — bottom-sheet modal + SwipeCard third button

**Files:**
- Create: `frontend/src/components/ui/Sheet.tsx`
- Create: `frontend/src/components/yeoyo/FlashMessageModal.tsx`
- Modify: `frontend/src/components/yeoyo/SwipeCard.tsx`
- Modify: `frontend/src/app/globals.css` (new slide-up keyframe)

**Interfaces:**
- Produces: `SwipeCard` gains two new required props — `onFlash: (userId: string, message: string) => void` and `creditBalance: number`. Task 6 passes both from `explorer/page.tsx`.
- Consumes: `Icon` (`@/components/ui/Icon`, `'zap'` icon already registered — no change needed there).

- [ ] **Step 1: Add the slide-up keyframe to globals.css**

In `frontend/src/app/globals.css`, find the `.animate-scale-in` rule (around line 262-264):

```css
.animate-scale-in {
  animation: scale-in 0.2s ease-out;
}
```

Add a new keyframe + class right after it:

```css
.animate-scale-in {
  animation: scale-in 0.2s ease-out;
}

/* Bottom sheet entrance (Message Flash, 2026-08-27) — slides up from the
   bottom edge instead of Modal.tsx's centered scale-in. See
   components/ui/Sheet.tsx. */
@keyframes sheet-slide-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
.animate-sheet-slide-up {
  animation: sheet-slide-up 0.25s ease-out;
}
```

Then find the `prefers-reduced-motion` block (around line 451-464) and add `.animate-sheet-slide-up` to the comma-separated selector list:

```css
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in-down,
  .animate-fade-in,
  .animate-fade-in-up,
  .animate-scale-in,
  .animate-sheet-slide-up,
  .animate-heart-pop,
  .animate-slide-out-left,
  .animate-slide-out-right,
  .skeleton-shimmer,
  .scroll-hint,
  .animate-hero-rise,
  .animate-hero-photo-in {
    animation: none;
  }
```

- [ ] **Step 2: Create the `Sheet` primitive**

Create `frontend/src/components/ui/Sheet.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';

// Generic bottom sheet — backdrop click or explicit close both call
// onClose. Slides up from the bottom edge (see `.animate-sheet-slide-up`
// in globals.css), unlike Modal.tsx's centered scale-in — for content
// that reads better anchored to the bottom on mobile. First consumer:
// FlashMessageModal.tsx.
export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-sheet-slide-up w-full max-w-sm rounded-t-2xl bg-surface p-6 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `FlashMessageModal`**

Create `frontend/src/components/yeoyo/FlashMessageModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';

// Message Flash (2026-08-27) — pay credits to attach a personalized
// message to a contact request, visible to the target before she accepts.
// Cost is display-only here — the real enforcement lives server-side in
// CREDIT_COSTS.flash_message (lib/server/credits/ledger.ts, a `server-only`
// module this client component can't import). Same reasoning as
// SwipeCard.tsx's own FREE_MONTHLY_CONTACT_REQUEST_LIMIT constant — keep
// this value in sync with the server if it ever changes.
const FLASH_MESSAGE_COST = 3;
const MAX_LENGTH = 2000;

export function FlashMessageModal({
  open,
  onClose,
  balance,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  balance: number;
  onSend: (message: string) => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const insufficient = balance < FLASH_MESSAGE_COST;

  function handleClose() {
    setMessage('');
    onClose();
  }

  return (
    <Sheet open={open} onClose={handleClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
            <Icon name="zap" size={22} />
          </div>
          <div>
            <p className="font-headings text-lg font-bold text-foreground">Message flash</p>
            <p className="font-body text-sm text-muted-foreground">
              Envoie un message directement, sans attendre qu&rsquo;elle accepte ta demande.
            </p>
          </div>
        </div>

        {insufficient ? (
          <>
            <p className="font-body text-sm text-muted-foreground">
              Le message flash coûte {FLASH_MESSAGE_COST} crédits. Il te reste {balance} crédit
              {balance > 1 ? 's' : ''} — achète un pack pour continuer.
            </p>
            <button
              type="button"
              onClick={() => router.push('/app/credits')}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-body text-sm font-bold text-primary-foreground transition-transform active:scale-95"
            >
              <Icon name="gem" size={16} />
              Acheter des crédits
            </button>
          </>
        ) : (
          <>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
              placeholder="Écris ton message…"
              rows={4}
              className="w-full resize-none rounded-xl border border-border bg-background p-3 font-body text-sm text-foreground"
            />
            <p className="text-right font-body text-xs text-muted-foreground">
              {message.length}/{MAX_LENGTH}
            </p>
            <p className="font-body text-xs text-muted-foreground">
              Coûte {FLASH_MESSAGE_COST} crédits, non remboursable même si elle refuse. Ton solde
              actuel : {balance} crédit{balance > 1 ? 's' : ''}.
            </p>
            <button
              type="button"
              onClick={() => onSend(message.trim())}
              disabled={message.trim().length === 0}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-body text-sm font-bold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
            >
              <Icon name="zap" size={16} />
              Envoyer — {FLASH_MESSAGE_COST} crédits
            </button>
          </>
        )}

        <button
          type="button"
          onClick={handleClose}
          className="flex h-12 items-center justify-center rounded-full border border-border font-body text-sm font-medium text-muted-foreground transition-transform active:scale-95"
        >
          Plus tard
        </button>
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 4: Wire the third button + modal into `SwipeCard`**

In `frontend/src/components/yeoyo/SwipeCard.tsx`:

Add the new import right after the existing `useLikePop` import (~line 73):

```ts
import { FlashMessageModal } from '@/components/yeoyo/FlashMessageModal';
```

Extend the props destructuring (currently lines 87-101) to add `onFlash` and `creditBalance`:

```ts
export function SwipeCard({
  profile,
  onDismiss,
  onLike,
  onFlash,
  onFavorite,
  favoriteBusy,
  busy,
  creditBalance,
}: {
  profile: ProfileCard;
  onDismiss: (userId: string) => void;
  onLike: (userId: string) => void;
  onFlash: (userId: string, message: string) => void;
  onFavorite?: (userId: string) => void;
  favoriteBusy?: boolean;
  busy?: boolean;
  creditBalance: number;
}) {
```

Add new local state right after the existing `showLightbox` state (~line 107):

```ts
  const [showLightbox, setShowLightbox] = useState(false);
  const [showFlashModal, setShowFlashModal] = useState(false);
```

Render the modal right after the existing `{showLightbox && <PhotoLightbox ... />}` block (~line 316-322), staying inside the same top-level `<div className="animate-fade-in-up ...">` wrapper:

```tsx
        {showLightbox && (
          <PhotoLightbox
            photoUrl={profile.photoUrls[photoIndex] ?? profile.photoUrls[0] ?? null}
            name={profile.firstName}
            onClose={() => setShowLightbox(false)}
          />
        )}
        <FlashMessageModal
          open={showFlashModal}
          onClose={() => setShowFlashModal(false)}
          balance={creditBalance}
          onSend={(message) => {
            setShowFlashModal(false);
            flyOff(1, () => onFlash(profile.userId, message));
          }}
        />
```

Finally, add the third button inside `renderActions()`, between the existing Passer (X) button and the Demander (+) button:

```tsx
  function renderActions(): ReactNode {
    return (
      <>
        <button
          type="button"
          onClick={() => flyOff(-1, () => onDismiss(profile.userId))}
          disabled={busy || exiting}
          aria-label="Passer ce profil"
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border-2 border-red-200 bg-red-50 shadow-md transition-transform active:scale-95 disabled:opacity-50"
        >
          <Icon name="x" size={22} className="text-primary" />
        </button>
        <button
          type="button"
          onClick={() => setShowFlashModal(true)}
          disabled={busy || exiting}
          aria-label="Message flash — envoyer un message avant que ta demande soit acceptée"
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border-2 border-gold/30 bg-gold/10 shadow-md transition-transform active:scale-95 disabled:opacity-50"
        >
          <Icon name="zap" size={20} className="text-gold" />
        </button>
        <button
          type="button"
          onClick={() => flyOff(1, () => onLike(profile.userId))}
          disabled={busy || liked || exiting}
          aria-label={`Demander — ${FREE_MONTHLY_CONTACT_REQUEST_LIMIT} demandes gratuites par mois`}
          className={`btn-success-flash relative flex h-14 flex-shrink-0 items-center gap-2 rounded-full px-6 font-body text-sm font-bold shadow-md shadow-secondary/25 transition-colors ${busy ? 'opacity-50' : ''} ${liked ? 'bg-secondary/70 text-secondary-foreground' : 'bg-secondary text-secondary-foreground'}`}
        >
          {busy ? (
            <Icon name="refresh-cw" size={16} className="flex-shrink-0 animate-spin" />
          ) : (
            <Icon
              name="plus"
              size={18}
              className={`flex-shrink-0 ${popping ? 'animate-heart-pop' : ''}`}
            />
          )}
          <span className="leading-none">{liked ? 'Envoyée' : 'Demander'}</span>
        </button>
      </>
    );
  }
```

(Only the middle button is new — the other two are unchanged, reproduced here so the ordering is unambiguous.)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter frontend run typecheck`
Expected: FAILS at this point — `explorer/page.tsx` renders `<SwipeCard>` without the new required `onFlash`/`creditBalance` props. This is expected; Task 6 fixes it. Confirm the failure is exactly that (missing props on `<SwipeCard>` in `explorer/page.tsx`), not something else in this task's own new files.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/globals.css frontend/src/components/ui/Sheet.tsx frontend/src/components/yeoyo/FlashMessageModal.tsx frontend/src/components/yeoyo/SwipeCard.tsx
git commit -m "feat(messaging): add Message Flash bottom-sheet modal + SwipeCard third button"
```

---

## Task 6: Frontend — wire `onFlash` into Explorer, fix `likeBack`'s nullable `conversationId`

**Correction vs. the spec:** §5.3 of the spec names `decouvrir/page.tsx` as the file that owns `SwipeCard`'s `onLike`/new `onFlash` wiring. That's not accurate for the current codebase — `decouvrir/page.tsx` renders a `RecommendedProfileCard` grid, not `SwipeCard`. `SwipeCard` is actually rendered from `frontend/src/app/app/explorer/page.tsx` (moved there 2026-08-10, per that file's own header comment; the `AppShell active="decouvrir"` prop it still passes is only a legacy nav-highlight key, not the real route). This task targets `explorer/page.tsx`, confirmed against the real file content during planning.

**Files:**
- Modify: `frontend/src/app/app/explorer/page.tsx`
- Modify: `frontend/src/app/app/likes/page.tsx`

**Interfaces:**
- Consumes: `SwipeCard`'s new `onFlash`/`creditBalance` props from Task 5. `POST /api/likes`'s new nullable `conversationId` response field from Task 2.

- [ ] **Step 1: Import `useCredits` in `explorer/page.tsx`**

In `frontend/src/app/app/explorer/page.tsx`, add to the existing import block (after the `useToast` import, ~line 17):

```ts
import { useToast } from '@/contexts/ToastContext';
import { useCredits } from '@/contexts/CreditsContext';
```

- [ ] **Step 2: Read credit balance + add the refresh call**

Inside `ExplorerPage()`, right after the existing `const { toast } = useToast();` line (~line 89):

```ts
  const { toast } = useToast();
  const { balance: creditBalance, refresh: refreshCredits } = useCredits();
```

- [ ] **Step 3: Add the `onFlash` handler**

Add this function right after the existing `onLike` function (~line 199-211):

```ts
  async function onLike(targetUserId: string) {
    setBusyUserId(targetUserId);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      setDeck((prev) => prev.map((p) => (p.userId === targetUserId ? { ...p, liked: true } : p)));
      toast('Profil aimé — une demande de contact a été envoyée', 'success');
      advance();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusyUserId(null);
    }
  }

  async function onFlash(targetUserId: string, message: string) {
    setBusyUserId(targetUserId);
    try {
      await api('/api/likes', {
        method: 'POST',
        body: { targetUserId, flashMessageBody: message },
      });
      setDeck((prev) => prev.map((p) => (p.userId === targetUserId ? { ...p, liked: true } : p)));
      toast('Message flash envoyé !', 'success');
      void refreshCredits();
      advance();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_CREDITS') {
        toast('Solde de crédits insuffisant pour ce message flash.', 'error');
      } else {
        toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
      }
    } finally {
      setBusyUserId(null);
    }
  }
```

- [ ] **Step 4: Pass the new props to both `<SwipeCard>` render sites**

`explorer/page.tsx` renders `<SwipeCard>` twice (swipe mode, once in each branch of the `showFilterPanel`/`error` conditional — around line 333 and line 584). Add `onFlash={onFlash}` and `creditBalance={creditBalance}` to **both**:

First site (~line 333-341):

```tsx
                <SwipeCard
                  key={current.userId}
                  profile={current}
                  onDismiss={onDismiss}
                  onLike={onLike}
                  onFlash={onFlash}
                  onFavorite={onFavorite}
                  favoriteBusy={favoritingUserId === current.userId}
                  busy={busyUserId === current.userId}
                  creditBalance={creditBalance}
                />
```

Second site (~line 584-592):

```tsx
                <SwipeCard
                  key={current.userId}
                  profile={current}
                  onDismiss={onDismiss}
                  onLike={onLike}
                  onFlash={onFlash}
                  onFavorite={onFavorite}
                  favoriteBusy={favoritingUserId === current.userId}
                  busy={busyUserId === current.userId}
                  creditBalance={creditBalance}
                />
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter frontend run typecheck`
Expected: PASS.

- [ ] **Step 6: Fix `likeBack`'s nullable `conversationId` in `likes/page.tsx`**

In `frontend/src/app/app/likes/page.tsx`, replace the `likeBack` function's non-`alreadyLiked` branch (currently lines 104-112):

```ts
      const res = await api<{ conversationId: string }>('/api/likes', {
        method: 'POST',
        body: { targetUserId: userId },
      });
      setLikes((prev) =>
        prev.map((l) => (l.profile.userId === userId ? { ...l, likedBack: true } : l)),
      );
      toast('C’est un match — direction la conversation !', 'success');
      router.push(`/app/messages/${res.conversationId}`);
```

with:

```ts
      const res = await api<{ conversationId: string | null }>('/api/likes', {
        method: 'POST',
        body: { targetUserId: userId },
      });
      setLikes((prev) =>
        prev.map((l) => (l.profile.userId === userId ? { ...l, likedBack: true } : l)),
      );
      if (res.conversationId) {
        toast('C’est un match — direction la conversation !', 'success');
        router.push(`/app/messages/${res.conversationId}`);
      } else {
        // Liking back someone who already liked you always hits the
        // mutual-match branch server-side (POST /api/likes), so this
        // should never actually happen — defensive fallback only.
        toast('C’est un match !', 'success');
      }
```

- [ ] **Step 7: Typecheck again**

Run: `pnpm --filter frontend run typecheck`
Expected: PASS.

- [ ] **Step 8: Manual verification (no automated coverage for page components, per this codebase's existing convention)**

Start the dev server (`pnpm dev`) and, with two test accounts (one HOMME, one FEMME):
1. On `/app/explorer` (swipe mode), confirm the middle gold lightning-bolt button opens the bottom sheet, sliding up from the bottom.
2. Send a flash message with enough credits — confirm the card exits, a success toast appears, and the credit balance in `TopNav` drops by 3.
3. Send a flash message with insufficient credits — confirm the sheet's "Acheter des crédits" state shows correctly and navigates to `/app/credits` on tap.
4. As the recipient, confirm the request appears on `/app/demandes` (Reçues) as PENDING and does **not** yet have a working Message link, then Accept it and confirm the flash text appears as the first message in the new conversation thread.
5. Trigger a mutual match (both sides like each other, at least one with a flash message) and confirm a Conversation is created immediately with a "C'est un match" notification, and the flash text(s) appear in the thread.
6. From `/app/likes`, "Aimer en retour" someone who already liked you — confirm it still navigates straight to the new conversation.

Report the outcome of this manual pass explicitly — this is required verification per the plan, even though it isn't an automated test.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/app/explorer/page.tsx frontend/src/app/app/likes/page.tsx
git commit -m "feat(messaging): wire the flash-message flow into Explorer, fix likeBack's nullable conversationId"
```

---

## Task 7 (optional, nice-to-have per spec §5.5): surface the flash message on the received Demandes card

Spec explicitly marks this optional: "recommended for the feature to have any point, but left as an implementation detail... not a hard requirement." Include it if time allows — it's small and self-contained.

**Files:**
- Modify: `frontend/src/app/api/contact-requests/route.ts`
- Modify: `frontend/src/app/app/demandes/page.tsx`
- Modify: `frontend/src/components/yeoyo/ContactRequestCard.tsx`

**Interfaces:**
- Produces: `GET /api/contact-requests` response rows gain an optional `flashMessageBody: string | null` field (received + PENDING rows only).

- [ ] **Step 1: Surface it in the API response**

In `frontend/src/app/api/contact-requests/route.ts`, the `rows.map(...)` block currently builds:

```ts
        return {
          id: row.id,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          conversationId: row.conversation?.id ?? null,
          otherUser: toProfileCard(otherUser.profile),
        };
```

Change it to:

```ts
        return {
          id: row.id,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          conversationId: row.conversation?.id ?? null,
          otherUser: toProfileCard(otherUser.profile),
          flashMessageBody:
            parsed.data.type === 'received' && row.status === 'PENDING' ? row.flashMessageBody : null,
        };
```

(No `select`/`include` change needed — `prisma.contactRequest.findMany` already returns all scalar fields by default, `flashMessageBody` included once Task 1's migration has landed.)

- [ ] **Step 2: Surface it in the Demandes page + card**

In `frontend/src/app/app/demandes/page.tsx`, extend the `RequestRow` interface:

```ts
interface RequestRow {
  id: string;
  status: string;
  createdAt: string;
  conversationId: string | null;
  otherUser: ProfileCard;
  flashMessageBody: string | null;
}
```

Find the `<ContactRequestCard` render site (search for `<ContactRequestCard`) and add the new prop, e.g.:

```tsx
                <ContactRequestCard
                  otherUser={r.otherUser}
                  status={r.status}
                  direction={tab === 'received' ? 'received' : 'sent'}
                  conversationId={r.conversationId}
                  flashMessageBody={r.flashMessageBody}
                  onAccept={...}
                  onDecline={...}
                  onWithdraw={...}
                  responding={respondingId === r.id}
                />
```

(Keep every existing prop exactly as it already is in that call site — only add `flashMessageBody={r.flashMessageBody}`.)

In `frontend/src/components/yeoyo/ContactRequestCard.tsx`, add the prop and render it above the action buttons, inside the received+PENDING branch:

```tsx
export function ContactRequestCard({
  otherUser,
  status,
  direction,
  conversationId,
  flashMessageBody,
  onAccept,
  onDecline,
  onWithdraw,
  responding,
}: {
  otherUser: ProfileCard;
  status: string;
  direction: 'received' | 'sent';
  conversationId?: string | null;
  flashMessageBody?: string | null;
  onAccept?: () => void;
  onDecline?: () => void;
  onWithdraw?: (() => void) | undefined;
  responding?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-4">
        <Link
          href={`/app/profils/${otherUser.userId}`}
          className="flex min-w-0 flex-1 items-center gap-4"
        >
          {/* ...unchanged... */}
        </Link>

        {/* ...unchanged status/action button block... */}
      </div>

      {flashMessageBody && (
        <div className="flex items-start gap-2 rounded-lg bg-gold/10 px-3 py-2">
          <Icon name="zap" size={14} className="mt-0.5 flex-shrink-0 text-gold" />
          <p className="font-body text-sm italic text-foreground">&ldquo;{flashMessageBody}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
```

(The outer wrapper changes from a single `flex items-center gap-4` row to a `flex flex-col gap-2` column containing that same row plus the new conditional flash block — every element inside the original row stays exactly as it already is today, just re-indented one level.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter frontend run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Send a flash message, then check `/app/demandes` (Reçues tab) as the recipient — confirm the message text appears in a gold-tinted callout above the Accepter/Refuser buttons.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/contact-requests/route.ts frontend/src/app/app/demandes/page.tsx frontend/src/components/yeoyo/ContactRequestCard.tsx
git commit -m "feat(messaging): surface the flash message text on the received Demandes card"
```

---

## Final verification (after all tasks)

Run the full gate from CLAUDE.md before considering this branch done:

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

Expected: all green. Then proceed per `superpowers:finishing-a-development-branch` (this work should already be happening in an isolated worktree per `superpowers:subagent-driven-development`'s setup step).
