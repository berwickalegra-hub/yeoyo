// GET /api/profiles/[userId] — a single member's full profile, for the new
// profile-detail screen (2026-08-10, user-driven — "je veux qu'on puisse
// cliquer sur un profil et voir ses images/infos"). Same visibility rules
// as the discovery routes (blocked either-way or non-public/incomplete
// profiles 404 rather than leaking existence) plus `liked`, so the detail
// screen can render "déjà aimé" instead of a raw duplicate-like error.
//
// 2026-08-31 (explicit user ask): also returns `incomingRequestId` — the id
// of a PENDING contact request this person has already sent to the viewer —
// so the detail screen can show "Accepter la demande" instead of "Demander"
// when the viewer stumbles onto the profile of someone who already asked.
//
// 2026-08-31 (same user, follow-up — a matched pair still saw "Demander" on
// each other's profile and each other in the deck): also returns
// `conversationId` when the two are already connected (an ACCEPTED contact
// request either direction), so the button becomes "Voir la conversation"
// instead of a dead "Demander". The discovery routes now exclude these
// people entirely — see lib/server/contact-requests/connections.ts.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { createLogger } from '@/lib/server/logger';
import { toProfileCard } from '@/lib/server/profile/card';
import { isBlockedEitherWay } from '@/lib/server/blocks';
import { orderedPair } from '@/lib/server/conversations/lib';

const log = createLogger();

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { userId } = await routeCtx.params;

    if (userId !== auth.user.sub && (await isBlockedEitherWay(auth.user.sub, userId))) {
      return NextResponse.json(
        { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: { photos: { orderBy: { order: 'asc' }, include: { fileUpload: true } } },
    });

    const isSelf = userId === auth.user.sub;
    if (!profile || !profile.onboardingCompletedAt || (!profile.visibilityPublic && !isSelf)) {
      return NextResponse.json(
        { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const pair = orderedPair(auth.user.sub, userId);
    const [liked, favorited, incomingRequest, connectedRequest, conversation]: [
      boolean,
      boolean,
      { id: string; status: string } | null,
      { id: string } | null,
      { id: string } | null,
    ] = isSelf
      ? [false, false, null, null, null]
      : await Promise.all([
          prisma.like
            .findUnique({
              where: { likerId_likedId: { likerId: auth.user.sub, likedId: userId } },
              select: { id: true },
            })
            .then((row) => !!row),
          prisma.favorite
            .findUnique({
              where: { userId_targetId: { userId: auth.user.sub, targetId: userId } },
              select: { id: true },
            })
            .then((row) => !!row),
          prisma.contactRequest.findUnique({
            where: { requesterId_targetId: { requesterId: userId, targetId: auth.user.sub } },
            select: { id: true, status: true },
          }),
          // Either direction — an ACCEPTED request means the two are matched.
          prisma.contactRequest.findFirst({
            where: {
              status: 'ACCEPTED',
              OR: [
                { requesterId: auth.user.sub, targetId: userId },
                { requesterId: userId, targetId: auth.user.sub },
              ],
            },
            select: { id: true },
          }),
          prisma.conversation.findUnique({
            where: { userAId_userBId: { userAId: pair.userAId, userBId: pair.userBId } },
            select: { id: true },
          }),
        ]);

    // Only a still-open request is actionable from the profile screen.
    const incomingRequestId =
      incomingRequest &&
      (incomingRequest.status === 'PENDING' || incomingRequest.status === 'VIEWED')
        ? incomingRequest.id
        : null;

    // Matched already → the button opens the chat, not a dead "Demander".
    const conversationId = connectedRequest ? (conversation?.id ?? null) : null;

    // Best-effort: powers the "Visiteurs" screen. Never blocks the response
    // — a failed write here shouldn't turn a profile view into an error page.
    if (!isSelf) {
      try {
        await prisma.profileView.create({ data: { viewerId: auth.user.sub, viewedId: userId } });
      } catch (err) {
        log.warn('Failed to record profile view', { error: err, viewedId: userId });
      }
    }

    return NextResponse.json(
      {
        profile: toProfileCard(profile),
        liked,
        favorited,
        incomingRequestId,
        conversationId,
        isSelf,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
