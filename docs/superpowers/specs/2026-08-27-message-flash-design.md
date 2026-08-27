# Message Flash — Design Spec

**Date:** 2026-08-27
**Status:** Approved by product owner in chat, 2026-08-27.

## 1. Problem & Context

YeOyo currently lets any user "like" a profile (`POST /api/likes`), which eagerly creates a `ContactRequest` **and** a `Conversation` in the same transaction — both people can already message each other immediately, regardless of whether the target has explicitly accepted the request. This was a deliberate choice made in commit `03ec726` ("mirrors the 'message request' pattern of modern dating apps"), replacing an earlier Premium-subscription-gated "flash message" feature that was removed in the same commit (dead schema fields `Profile.flashMessagesUsed` / `Profile.flashMessagesResetAt` are leftover debris from that removed feature and are out of scope for this spec — they are not reused).

The product owner wants to reintroduce a paid "Message Flash" capability: a man can pay credits to attach a personalized message to his contact request, visible to the target **before** she decides whether to accept. Building this cleanly requires reverting the "conversation opens immediately" behavior for **all** contact requests (flash or not) back to "a conversation only exists once the request is accepted" — this was a deliberate scope expansion approved by the product owner after being shown the smaller, flash-only-gated alternative.

## 2. Global Constraints

- Money/credits stay integer, never a float (existing invariant, `lib/server/credits/ledger.ts`).
- Every Route Handler keeps `export const runtime = 'nodejs'` (existing invariant).
- Every mutating route calls `verifyCsrf(req)` first (existing invariant).
- `spendCredits`/`grantCredits` remain the only choke points for credit-balance mutation — no direct `user.creditBalance` writes anywhere new.
- No file in CLAUDE.md's protected list is touched by this feature.
- **Message Flash costs 3 credits, charged at send time, non-refundable if the request is later declined or never answered** — matches the existing "pay for the action, not the outcome" pattern already used by `boost` (3 credits) and `first_message` (1 credit).
- **A conversation only becomes usable once the underlying `ContactRequest` is `ACCEPTED`** — this now applies to every contact request, not just flash ones. Exception: a **mutual like** (both sides have already liked each other) auto-accepts both requests and creates the conversation immediately, matching standard "it's a match" semantics.
- A flash message, once its request is accepted, becomes the conversation's real first `Message` (sender = the original requester) — this is not a separate notification-only preview, it is a real message the recipient can reply to.
- The existing "first message costs 1 credit, men only" rule (`computeFirstMessageCost` in `conversations/[id]/messages/route.ts`) must never double-charge on top of a flash message. No new code is needed to guarantee this: because the flash message becomes the conversation's message #1, `computeFirstMessageCost`'s existing `messageCount === 0` check naturally evaluates false for any later message in that conversation.

## 3. Data Model Changes

**`ContactRequest`** gains one nullable field:

```prisma
model ContactRequest {
  // ... existing fields unchanged ...
  // Message Flash (2026-08-27) — optional personalized message attached at
  // request time, shown to the target before she accepts/declines. Becomes
  // the conversation's real first Message once accepted (see
  // POST /api/contact-requests/[id]/respond). Non-refundable if declined —
  // the 3-credit charge already happened at send time in POST /api/likes.
  flashMessageBody String? @db.Text
}
```

No new model, no new migration-breaking index. A single additive nullable column — standard `prisma migrate diff --script` + manual migration folder (same non-interactive workaround used throughout this session) + `migrate deploy`.

**`lib/server/credits/ledger.ts`** — add one entry to `CREDIT_COSTS`:

```ts
export const CREDIT_COSTS = {
  view_visitors: 1,
  view_favorited_by: 1,
  boost: 3,
  first_message: 1,
  flash_message: 3,
} as const;
```

## 4. API Changes

### 4.1 `POST /api/likes` — stop eager Conversation creation, accept an optional flash message

Current behavior (transaction): upsert `Like` → upsert `ContactRequest` → upsert `Conversation` (eager, unconditional).

New behavior:

1. `Body` schema gains an optional field: `flashMessageBody: z.string().trim().min(1).max(2000).optional()` (same 2000-char cap as `messages/route.ts`'s `Body.body`, for consistency).
2. Inside the transaction, check whether a reverse `ContactRequest` (`requesterId: targetUserId, targetId: auth.user.sub`) already exists with `status: 'PENDING'` — this determines the **mutual-match** branch (4.1.a) vs the **normal** branch (4.1.b). This read must happen inside the transaction, not before it, to avoid a race where the reverse request is created concurrently between a pre-transaction check and this transaction's writes.
3. Inside that same transaction:
   - If `flashMessageBody` was provided: call `spendCredits(tx, { userId: auth.user.sub, action: 'flash_message', role: sender.role })` **first**. If `!result.ok`, throw a sentinel error to abort the transaction (Prisma rolls back automatically on a thrown error inside `$transaction`); the outer catch returns `402 INSUFFICIENT_CREDITS` with the current balance, mirroring the existing `activateBoost` error-handling pattern in `decouvrir/page.tsx`. **Nothing is created — no Like, no ContactRequest — if the charge fails.**
   - Upsert `Like` (unchanged).
   - Upsert `ContactRequest`, now also writing `flashMessageBody: flashMessageBody ?? null` on create (an existing re-liked/CANCELLED→PENDING transition does **not** overwrite a previously-set `flashMessageBody` — only a brand-new row sets it; re-triggering a like never re-charges or re-attaches a message; this mirrors the existing idempotency guarantee already documented in this route's header comment).
   - **(4.1.a) Mutual match**: if the reverse `ContactRequest` exists and is `PENDING`, flip **both** requests to `ACCEPTED` and create the `Conversation` now (`create`, not `upsert` — it must not already exist by construction of this change). If either side's request carried a `flashMessageBody`, insert each as a real `Message` in the conversation, ordered by each request's `createdAt` (oldest first) — `senderId` is each request's own `requesterId`.
   - **(4.1.b) Normal (no mutual match yet)**: do **not** create a `Conversation`. The request stays `PENDING`, with `flashMessageBody` stored for later.
4. Response shape: keep `likeId`, `contactRequestId`, `contactRequestStatus` (now genuinely reflects `PENDING` vs `ACCEPTED`-via-match). **`conversationId` becomes nullable** — `null` in the normal (4.1.b) case, populated only in the mutual-match case (4.1.a). Existing consumers of this response (`onLike` in `decouvrir/page.tsx`, `likeBack` in `likes/page.tsx`) are updated in the same task (see §6).

### 4.2 `POST /api/contact-requests/[id]/respond` — ACCEPT branch now really creates the Conversation

Current behavior: `conversation.upsert` — effectively a no-op today since the row already exists eagerly.

New behavior: the upsert becomes a **real create** in the common case (the conversation does not yet exist). Immediately after creating it, if `request.flashMessageBody` is set, insert it as the conversation's first `Message` (`senderId: request.requesterId`, `body: request.flashMessageBody`). This runs inside the **same transaction** that already exists in this route (the one that also holds the FIRST_MATCH_BONUS logic added earlier this session) — ordering inside that transaction: `contactRequest.update` → `conversation.create` (or upsert, safe either way) → **insert flash message if present** → FIRST_MATCH_BONUS logic (unchanged, already reads `tx.user.findMany` for both participants — unaffected by this change since it doesn't touch messages).

The DECLINE branch is unchanged — no refund logic, per §2's non-refundable constraint.

### 4.3 No other route needs a status check

Per the blast-radius research already done this session: `GET /api/conversations`, `GET`/`POST /api/conversations/[id]/messages`, `DELETE /api/conversations/[id]/messages/[messageId]`, `PATCH /api/conversations/[id]/mute`, and `POST /api/realtime/token` all currently gate only on `isParticipant` (membership), never on `ContactRequest.status`. Because a `Conversation` row will no longer exist until acceptance (or mutual match), these routes need **zero code changes** — a `PENDING` request simply has no `Conversation` row for them to find, so `isParticipant`'s existing 404-on-missing behavior already does the right thing.

## 5. Frontend Changes

### 5.1 `SwipeCard.tsx` — third button

Add a middle button (message-flash icon, distinct styling from the existing reject/like buttons) between the existing ❌ and ➕ buttons. Tapping it opens the new bottom-sheet modal (5.2) instead of immediately liking.

### 5.2 New bottom-sheet modal component

A new component (check for an existing generic `Modal`/`Sheet` primitive in `src/components/ui/` first — reuse if present, otherwise build a minimal bottom-sheet: fixed-position panel, slides up from the bottom via a CSS transform/transition, rounded top corners, dismissible via a "Plus tard"-equivalent button or backdrop tap). Contents: explain the 3-credit cost, a `<textarea>` for the message (max 2000 chars, same cap as `messages/route.ts`), a confirm button that calls `POST /api/likes` with `flashMessageBody` set, and a cancel/dismiss action. On `INSUFFICIENT_CREDITS`, show the existing app-wide insufficient-credits messaging pattern (mirror `activateBoost`'s catch block in `decouvrir/page.tsx`).

### 5.3 `decouvrir/page.tsx` — `onLike`, new `onFlash`

`onLike` (normal ➕ button): unaffected in its call shape, but its success toast text ("une demande de contact a été envoyée") stays accurate since that's still exactly what happens.

New `onFlash(targetUserId, message)`: calls `POST /api/likes` with `{ targetUserId, flashMessageBody: message }`, handles `INSUFFICIENT_CREDITS` distinctly (toast + likely a prompt to buy credits), on success shows a toast confirming the flash was sent and removes the card from the stack same as a normal like.

### 5.4 `likes/page.tsx` — `likeBack`

Currently navigates unconditionally to `/app/messages/${res.conversationId}`. After this change, `res.conversationId` is non-null in exactly the mutual-match case (4.1.a) — which `likeBack` always hits by definition (you can only "like back" someone who already liked you, so the reverse-PENDING check in 4.1.a always fires). So `likeBack`'s existing navigation is actually still correct with **zero logic change** — only the response's `conversationId` being reliably non-null in this specific call site needs verifying in the implementer's own testing, not a code change.

### 5.5 `ContactRequestCard.tsx` (Demandes)

Already correctly gates its "Message" link on `status === 'ACCEPTED'` (confirmed in this session's research) — no change needed. Optionally (not required), surface the flash message body itself somewhere in the received-request card so she can read it before deciding — recommended for the feature to have any point, but left as an implementation detail for whoever builds the UI task, not a hard requirement of this spec.

### 5.6 `prisma/schema.prisma` doc comment

The `Conversation` model's header comment currently says "A Conversation is created when the target ACCEPTs a ContactRequest" — this was already stale (described the pre-03ec726 behavior). This change makes it true again; update the comment to also mention the mutual-match exception.

## 6. Error Handling

- Insufficient credits for a flash send: `402` (matching `activateBoost`'s existing convention) with code `INSUFFICIENT_CREDITS`, current balance included. Nothing is created.
- All other existing error paths on `/api/likes` and `/api/contact-requests/[id]/respond` (self-like, blocked, not-found, already-resolved, quota-exceeded) are unchanged.

## 7. Testing

- `POST /api/likes`: normal like still creates only Like+ContactRequest, no Conversation, `conversationId: null` in the response. Flash like with sufficient credits: charges 3 credits, creates the request with `flashMessageBody` set, still `conversationId: null`. Flash like with insufficient credits: nothing created, balance unchanged, 402 returned. Mutual match (reverse PENDING request exists): both requests flip to ACCEPTED, Conversation created, any flash message(s) inserted as real Messages in `createdAt` order. Re-liking an existing PENDING request never re-charges or overwrites an existing `flashMessageBody`.
- `POST /api/contact-requests/[id]/respond` ACCEPT: Conversation is genuinely created (not a no-op upsert) when it didn't exist; a stored `flashMessageBody` becomes the conversation's message #1 with the correct `senderId`; a request with no flash message creates an empty conversation as before. Existing FIRST_MATCH_BONUS tests (already passing, added earlier this session) must keep passing unmodified — this change only adds logic before that block, doesn't alter it.
- Regression: a normal (non-flash) accepted conversation's first real message from the man still costs 1 credit exactly once (existing `computeFirstMessageCost` test suite) — verify no double-charge occurs when a flash-originated conversation's man sends a *second* message post-accept.
- `likes/page.tsx` `likeBack` and `decouvrir/page.tsx` `onLike`/`onFlash`: no automated tests expected (this codebase has zero test coverage for page components, confirmed convention throughout this session) — manual verification only, called out explicitly in the implementer's report.

## 8. Out of Scope

- Refunding flash-message credits on decline or non-response (see §2 — explicitly rejected in favor of simplicity, matching existing `boost`/`first_message` precedent).
- Reusing or resurrecting the dead `Profile.flashMessagesUsed`/`flashMessagesResetAt` columns from the old Premium-gated feature — they stay unused; a future cleanup could drop them but that is not part of this change.
- Image attachments on a flash message (text only, matching the 2000-char cap; `messages/route.ts`'s `imageUploadId` support is not extended to flash messages in v1).
- Gating `POST /api/realtime/token` more granularly — out of scope because, per §4.3, a PENDING request's Conversation simply doesn't exist yet, so there is nothing to leak a token for; no separate change needed there.
