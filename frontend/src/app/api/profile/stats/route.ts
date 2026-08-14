// GET /api/profile/stats — "Mes statistiques" card on Mon Profil: real
// lifetime counts (visitors, people who favorited me, contact requests
// received) backing Banani's ProfilePage.jsx sidebar stats block. Distinct
// from /api/profile/stats-today (Explorer's daily quota panel — likes-given-
// today + message quota, a different concern).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const [visitorsCount, favoritedByCount, requestsReceivedCount] = await Promise.all([
      prisma.profileView.findMany({
        where: { viewedId: auth.user.sub },
        distinct: ['viewerId'],
        select: { viewerId: true },
      }),
      prisma.favorite.count({ where: { targetId: auth.user.sub } }),
      prisma.contactRequest.count({ where: { targetId: auth.user.sub } }),
    ]);

    return NextResponse.json(
      {
        visitorsCount: visitorsCount.length,
        favoritedByCount,
        requestsReceivedCount,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
