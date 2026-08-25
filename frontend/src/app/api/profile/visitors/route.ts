// GET /api/profile/visitors — "Visiteurs": who viewed my profile, most
// recent visit first, deduped to one row per visitor. ProfileView rows are
// written best-effort by GET /api/profiles/[userId]. Blocked-either-way
// users are excluded even if a view row predates the block.
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

    const blocked = await blockedUserIds(auth.user.sub);

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
      .map((p) => ({
        profile: toProfileCard(p),
        viewedAt: lastViewedAt.get(p.userId)!.toISOString(),
      }));

    return NextResponse.json(
      { visitors, total: visitors.length },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
