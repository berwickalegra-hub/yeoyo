// GET /api/profile/favorited-by — "X personnes apprécient ton profil"
// teaser (Banani's WhoLikedBanner.jsx): a few real profiles who favorited
// me, most recent first, deduped, blocked-either-way excluded. Mirrors
// /api/profile/visitors' shape/pattern. This route always returns real
// profile data regardless of the caller's balance; the paywall is a
// display-layer decision, not a data-access one (consistent with how
// /api/likes already works) — client-side blur per row, driven by the
// `revealed` flag below.
//
// 2026-08-25 (credit gating Script 3): a row is `revealed` once its
// Favorite.createdAt is at/before Profile.favoritedByUnlockedAt — set by
// POST /api/credits/spend { action: 'view_favorited_by' }, see that route's
// header comment for the "permanent reveal, new ones re-blur" model.
// `unrevealedCount` (computed across the FULL favorited-by list, not just
// the 3-row preview) tells the client whether there's anything left worth
// spending another credit on.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { toProfileCard } from '@/lib/server/profile/card';
import { blockedUserIds } from '@/lib/server/blocks';

const MAX_RESULTS = 3;
const EPOCH = new Date(0);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const [blocked, me] = await Promise.all([
      blockedUserIds(auth.user.sub),
      prisma.profile.findUnique({
        where: { userId: auth.user.sub },
        select: { favoritedByUnlockedAt: true },
      }),
    ]);
    const unlockedAt = me?.favoritedByUnlockedAt ?? null;

    const favorites = await prisma.favorite.findMany({
      where: { targetId: auth.user.sub, userId: { notIn: blocked } },
      orderBy: { createdAt: 'desc' },
      take: MAX_RESULTS,
      select: { userId: true, createdAt: true },
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

    const preview = favorites
      .map((f) => {
        const p = byUserId.get(f.userId);
        if (!p) return null;
        return { ...toProfileCard(p), revealed: !!unlockedAt && f.createdAt <= unlockedAt };
      })
      .filter((p): p is NonNullable<typeof p> => !!p);

    const [total, unrevealedCount] = await Promise.all([
      prisma.favorite.count({ where: { targetId: auth.user.sub, userId: { notIn: blocked } } }),
      prisma.favorite.count({
        where: {
          targetId: auth.user.sub,
          userId: { notIn: blocked },
          createdAt: { gt: unlockedAt ?? EPOCH },
        },
      }),
    ]);

    return NextResponse.json(
      { preview, total, unrevealedCount },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
