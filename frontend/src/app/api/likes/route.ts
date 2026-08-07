// POST /api/likes — like a profile. Per the Demandes screen's own explainer
// ("Tu likes un profil → Une demande de contact est envoyée automatiquement"),
// liking auto-creates a PENDING ContactRequest in the same transaction.
// Idempotent: liking twice returns the existing rows instead of erroring.
//
// GET /api/likes/received (sibling route) covers "who liked me".
//
// A Conversation is upserted in the same transaction as the Like/ContactRequest
// (not gated on the target accepting) so the liker can open a chat and write
// immediately — mirrors the "message request" pattern of modern dating apps
// instead of forcing a wait for mutual accept before any text can be sent.
// POST /api/contact-requests/[id]/respond still upserts the same row on
// ACCEPT (idempotent — `update: {}` never touches contactRequestId).
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
import { contactRequestReceived } from '@/lib/server/notifications/templates';
import { isChannelEnabled, parsePrefs } from '@/lib/server/notifications/prefs-merge';
import { orderedPair } from '@/lib/server/conversations/lib';

const Body = z.object({ targetUserId: z.string() });

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
    const { targetUserId } = parsed.data;

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

    const { userAId, userBId } = orderedPair(auth.user.sub, targetUserId);
    const { like, contactRequest, conversation } = await prisma.$transaction(async (tx) => {
      const likeRow = await tx.like.upsert({
        where: { likerId_likedId: { likerId: auth.user.sub, likedId: targetUserId } },
        create: { likerId: auth.user.sub, likedId: targetUserId },
        update: {},
      });

      const contactRequestRow = await tx.contactRequest.upsert({
        where: { requesterId_targetId: { requesterId: auth.user.sub, targetId: targetUserId } },
        create: { requesterId: auth.user.sub, targetId: targetUserId },
        update: {},
      });

      const conversationRow = await tx.conversation.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        create: { userAId, userBId, contactRequestId: contactRequestRow.id },
        update: {},
      });

      return { like: likeRow, contactRequest: contactRequestRow, conversation: conversationRow };
    });

    const [likerProfile, targetPrefsRow] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: auth.user.sub }, select: { firstName: true } }),
      prisma.notificationPreferences.findUnique({
        where: { userId: targetUserId },
        select: { prefs: true },
      }),
    ]);
    if (isChannelEnabled(parsePrefs(targetPrefsRow?.prefs), 'CONTACT_REQUEST', 'inApp')) {
      await createNotification(
        prisma,
        contactRequestReceived(
          targetUserId,
          contactRequest.id,
          likerProfile?.firstName ?? 'Quelqu’un',
        ),
      );
    }

    return NextResponse.json(
      {
        likeId: like.id,
        contactRequestId: contactRequest.id,
        contactRequestStatus: contactRequest.status,
        conversationId: conversation.id,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
