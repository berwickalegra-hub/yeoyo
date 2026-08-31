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
import { sendPushToUser } from '@/lib/server/push';
import {
  contactRequestReceived,
  contactRequestAccepted,
} from '@/lib/server/notifications/templates';
import { isChannelEnabled, parsePrefs } from '@/lib/server/notifications/prefs-merge';
import { orderedPair } from '@/lib/server/conversations/lib';
import { contactRequestQuotaStatus } from '@/lib/server/contact-requests/quota';
import { spendCredits, CREDIT_COSTS } from '@/lib/server/credits/ledger';
import { lockUserTx } from '@/lib/server/withdrawals/lock';

const Body = z.object({
  targetUserId: z.string(),
  flashMessageBody: z.string().trim().min(1).max(2000).optional(),
});

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

    const [targetProfile, actorProfile] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: targetUserId } }),
      prisma.profile.findUnique({
        where: { userId: auth.user.sub },
        select: { demo: true },
      }),
    ]);
    if (!targetProfile || !targetProfile.onboardingCompletedAt) {
      return NextResponse.json(
        { code: 'PROFILE_NOT_FOUND', message: 'Target profile not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Demo and real accounts can't reach each other (discovery hides them
    // both ways — this is the matching guard on the mutation path).
    if (targetProfile.demo !== (actorProfile?.demo ?? false)) {
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
              'Tu as atteint la limite de demandes de contact gratuites pour aujourd’hui. Reviens demain pour continuer.',
            quota: { remaining: quota.remaining, limit: quota.limit, resetAt: quota.resetAt },
          },
          { status: 403, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const { userAId, userBId } = orderedPair(auth.user.sub, targetUserId);
    const result = await prisma.$transaction(async (tx) => {
      // Serializes concurrent POST /api/likes for the same user — without
      // this, two concurrent requests can both observe "no existing row"
      // and both spend flash-message credits before either commits (task
      // review finding). Reuses the withdrawals domain's own advisory-lock
      // helper — that lock is per-user and short-lived, safe to reuse
      // outside its original domain.
      await lockUserTx(tx, auth.user.sub);

      // Freshly re-read inside the lock — the pre-transaction `existingRequest`
      // read (used only for the quota check above, which already tolerates
      // being a soft/non-atomic check) can be stale by the time we get here
      // under concurrency; only this in-lock read is safe to gate the credit
      // charge and the flashMessageBody write on.
      const existingFresh = await tx.contactRequest.findUnique({
        where: { requesterId_targetId: { requesterId: auth.user.sub, targetId: targetUserId } },
      });
      const isNewRequestInTx = !existingFresh;

      let effectiveFlashMessageBody = flashMessageBody;
      if (isNewRequestInTx && flashMessageBody) {
        const sender = await tx.user.findUnique({
          where: { id: auth.user.sub },
          select: { role: true, profile: { select: { gender: true } } },
        });
        const isStaff = sender?.role === 'ADMIN' || sender?.role === 'SUPERADMIN';
        const isMan = sender?.profile?.gender === 'HOMME';
        if (!isMan && !isStaff) {
          // Message Flash is a HOMME-only paid feature (spec: "a man can
          // pay 3 credits"), matching the first_message credit rule's own
          // gender gate. A non-HOMME caller's flash is silently dropped —
          // no charge, not stored — the like still succeeds normally.
          effectiveFlashMessageBody = undefined;
        } else {
          const spend = await spendCredits(tx, {
            userId: auth.user.sub,
            action: 'flash_message',
            role: sender?.role ?? null,
          });
          if (!spend.ok) {
            return { ok: false as const, balance: spend.balance };
          }
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
          flashMessageBody: effectiveFlashMessageBody ?? null,
        },
        // A previously-withdrawn (CANCELLED) request that gets re-liked
        // should go back to PENDING instead of staying stuck as cancelled.
        // Never touches flashMessageBody here — only `create` sets it, so a
        // re-like can't re-charge or overwrite a previously-attached flash.
        // But an already-ACCEPTED request (a live conversation exists) must
        // NOT be reset to PENDING by a re-like — that would make the
        // conversation look unusable to any code gating on
        // ContactRequest.status === 'ACCEPTED' (task review finding).
        update: existingFresh?.status === 'ACCEPTED' ? {} : { status: 'PENDING' },
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
      const conversationRow = await tx.conversation.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        create: { userAId, userBId, contactRequestId: contactRequestRow.id },
        update: {},
      });

      const flashSources: { senderId: string; body: string | null; createdAt: Date }[] = [
        // Skip our own side's flash if this request was already ACCEPTED before
        // this transaction — its flash (if any) was already delivered as
        // Message #1 by POST /api/contact-requests/[id]/respond or an earlier
        // mutual match. reverseRequest is always safe: mutualMatch is only
        // true when reverseRequest.status === 'PENDING', and a PENDING
        // request's flash has never been delivered yet.
        ...(existingFresh?.status === 'ACCEPTED'
          ? []
          : [
              {
                senderId: contactRequestRow.requesterId,
                body: contactRequestRow.flashMessageBody,
                createdAt: contactRequestRow.createdAt,
              },
            ]),
        {
          senderId: reverseRequest.requesterId,
          body: reverseRequest.flashMessageBody,
          createdAt: reverseRequest.createdAt,
        },
      ];
      const orderedFlashSources = flashSources
        .filter((s): s is { senderId: string; body: string; createdAt: Date } => !!s.body)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      for (const [i, source] of orderedFlashSources.entries()) {
        await tx.message.create({
          data: {
            conversationId: conversationRow.id,
            senderId: source.senderId,
            body: source.body,
            // Explicit, distinct timestamps — two rows inserted in the same
            // transaction would otherwise both get Postgres's transaction-start
            // CURRENT_TIMESTAMP, making display order between them arbitrary
            // (M1 in the final review).
            createdAt: new Date(Date.now() + i),
          },
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
      void sendPushToUser(prisma, targetUserId, {
        title: `C'est un match avec ${likerProfile?.firstName ?? 'Quelqu’un'} !`,
        body: 'Vous pouvez maintenant discuter.',
        url: `/app/messages/${result.conversationId as string}`,
        tag: `match:${result.matchedRequestId}`,
      }).catch(() => undefined);
    } else {
      if (isChannelEnabled(parsePrefs(targetPrefsRow?.prefs), 'CONTACT_REQUEST', 'inApp')) {
        await createNotification(
          prisma,
          contactRequestReceived(
            targetUserId,
            result.contactRequest.id,
            likerProfile?.firstName ?? 'Quelqu’un',
          ),
        );
      }
      if (isChannelEnabled(parsePrefs(targetPrefsRow?.prefs), 'CONTACT_REQUEST', 'push')) {
        void sendPushToUser(prisma, targetUserId, {
          title: `${likerProfile?.firstName ?? 'Quelqu’un'} s'intéresse à toi`,
          body: 'Une nouvelle demande de contact t’attend.',
          url: '/app/demandes',
          tag: `req:${result.contactRequest.id}`,
        }).catch(() => undefined);
      }
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

export async function DELETE(req: NextRequest): Promise<NextResponse> {
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
    const { targetUserId } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.like
        .delete({
          where: { likerId_likedId: { likerId: auth.user.sub, likedId: targetUserId } },
        })
        .catch(() => null);

      // Only withdraw the request while it's still unanswered — an ACCEPTED
      // request already has a live conversation, and CANCELLED is already
      // final either way.
      const updated = await tx.contactRequest.updateMany({
        where: { requesterId: auth.user.sub, targetId: targetUserId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });

      return { likeExisted: !!deleted, contactRequestCancelled: updated.count > 0 };
    });

    return NextResponse.json(result, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
