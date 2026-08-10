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
import { toProfileCard } from '@/lib/server/profile/card';
import { isBlockedEitherWay } from '@/lib/server/blocks';

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

    const liked = isSelf
      ? false
      : !!(await prisma.like.findUnique({
          where: { likerId_likedId: { likerId: auth.user.sub, likedId: userId } },
          select: { id: true },
        }));

    return NextResponse.json(
      { profile: toProfileCard(profile), liked, isSelf },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
