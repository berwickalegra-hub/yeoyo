// GET /api/profiles/[userId] — a single member's full profile, for the new
// profile-detail screen (2026-08-10, user-driven — "je veux qu'on puisse
// cliquer sur un profil et voir ses images/infos"). Same visibility rules
// as the discovery routes (blocked either-way or non-public/incomplete
// profiles 404 rather than leaking existence) plus `liked`, so the detail
// screen can render "déjà aimé" instead of a raw duplicate-like error.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { createLogger } from '@/lib/server/logger';
import { toProfileCard } from '@/lib/server/profile/card';
import { isBlockedEitherWay } from '@/lib/server/blocks';
import { getPremiumUserIds } from '@/lib/server/subscriptions/premium-status';

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

    const [liked, favorited] = isSelf
      ? [false, false]
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
        ]);

    // Best-effort: powers the "Visiteurs" screen. Never blocks the response
    // — a failed write here shouldn't turn a profile view into an error page.
    if (!isSelf) {
      try {
        await prisma.profileView.create({ data: { viewerId: auth.user.sub, viewedId: userId } });
      } catch (err) {
        log.warn('Failed to record profile view', { error: err, viewedId: userId });
      }
    }

    const premiumIds = await getPremiumUserIds(prisma, [userId]);

    return NextResponse.json(
      {
        profile: { ...toProfileCard(profile), isPremium: premiumIds.has(userId) },
        liked,
        favorited,
        isSelf,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
