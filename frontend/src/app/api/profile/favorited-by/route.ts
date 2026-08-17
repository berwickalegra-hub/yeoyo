// GET /api/profile/favorited-by — "X personnes apprécient ton profil"
// teaser (Banani's WhoLikedBanner.jsx): a few real profiles who favorited
// me, most recent first, deduped, blocked-either-way excluded. Mirrors
// /api/profile/visitors' shape/pattern. Free users see the blurred avatar
// count only (client-side blur, per WhoLikedBanner) — Premium unlocks who,
// so this route intentionally returns real profile data regardless of the
// caller's plan; the paywall is a display-layer decision, not a data-access
// one (consistent with how /api/likes already works).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { toProfileCard } from '@/lib/server/profile/card';
import { blockedUserIds } from '@/lib/server/blocks';
import { getPremiumUserIds } from '@/lib/server/subscriptions/premium-status';

const MAX_RESULTS = 3;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const blocked = await blockedUserIds(auth.user.sub);

    const favorites = await prisma.favorite.findMany({
      where: { targetId: auth.user.sub, userId: { notIn: blocked } },
      orderBy: { createdAt: 'desc' },
      take: MAX_RESULTS,
      select: { userId: true },
    });

    const profiles = await prisma.profile.findMany({
      where: {
        userId: { in: favorites.map((f) => f.userId) },
        visibilityPublic: true,
        onboardingCompletedAt: { not: null },
      },
      include: { photos: { orderBy: { order: 'asc' }, include: { fileUpload: true } } },
    });
    const byUserId = new Map(profiles.map((p) => [p.userId, p]));
    const premiumIds = await getPremiumUserIds(
      prisma,
      profiles.map((p) => p.userId),
    );

    const preview = favorites
      .map((f) => byUserId.get(f.userId))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ ...toProfileCard(p), isPremium: premiumIds.has(p.userId) }));

    const total = await prisma.favorite.count({
      where: { targetId: auth.user.sub, userId: { notIn: blocked } },
    });

    return NextResponse.json(
      { preview, total },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
