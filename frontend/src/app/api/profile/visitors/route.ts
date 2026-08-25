// GET /api/profile/visitors — "Visiteurs": who viewed my profile, most
// recent visit first, deduped to one row per visitor. ProfileView rows are
// written best-effort by GET /api/profiles/[userId]. Blocked-either-way
// users are excluded even if a view row predates the block.
//
// 2026-08-25 (credit gating Script 3): a visitor row is `revealed` once
// their most recent visit (`viewedAt`) is at/before
// Profile.visitorsUnlockedAt — set by POST /api/credits/spend { action:
// 'view_visitors' }. Same "permanent reveal, new visits re-blur" model as
// /api/profile/favorited-by — see that route's comment. `unrevealedCount`
// is computed in-memory from this same (already deduped, capped) list —
// unlike favorited-by there's no separate uncapped "total" query today, so
// no second DB round-trip is needed here.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { toProfileCard } from '@/lib/server/profile/card';
import { blockedUserIds } from '@/lib/server/blocks';

const MAX_VISITORS = 50;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const [blocked, me] = await Promise.all([
      blockedUserIds(auth.user.sub),
      prisma.profile.findUnique({
        where: { userId: auth.user.sub },
        select: { visitorsUnlockedAt: true },
      }),
    ]);
    const unlockedAt = me?.visitorsUnlockedAt ?? null;

    const views = await prisma.profileView.findMany({
      where: { viewedId: auth.user.sub, viewerId: { notIn: blocked } },
      orderBy: { createdAt: 'desc' },
      take: 500, // dedupe window before slicing to MAX_VISITORS distinct visitors
      select: { viewerId: true, createdAt: true },
    });

    const seen = new Set<string>();
    const lastViewedAt = new Map<string, Date>();
    const orderedVisitorIds: string[] = [];
    for (const v of views) {
      if (seen.has(v.viewerId)) continue;
      seen.add(v.viewerId);
      lastViewedAt.set(v.viewerId, v.createdAt);
      orderedVisitorIds.push(v.viewerId);
      if (orderedVisitorIds.length >= MAX_VISITORS) break;
    }

    const profiles = await prisma.profile.findMany({
      where: {
        userId: { in: orderedVisitorIds },
        visibilityPublic: true,
        onboardingCompletedAt: { not: null },
      },
      include: { photos: { orderBy: { order: 'asc' }, include: { fileUpload: true } } },
    });
    const byUserId = new Map(profiles.map((p) => [p.userId, p]));

    const visitors = orderedVisitorIds
      .map((id) => byUserId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => {
        const viewedAt = lastViewedAt.get(p.userId)!;
        return {
          profile: toProfileCard(p),
          viewedAt: viewedAt.toISOString(),
          revealed: !!unlockedAt && viewedAt <= unlockedAt,
        };
      });
    const unrevealedCount = visitors.filter((v) => !v.revealed).length;

    return NextResponse.json(
      { visitors, total: visitors.length, unrevealedCount },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
