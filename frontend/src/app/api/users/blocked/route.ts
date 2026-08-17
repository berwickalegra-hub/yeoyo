// GET /api/users/blocked — the Paramètres "Utilisateurs bloqués" list.
// Unblocking itself is DELETE /api/users/[id]/block (Phase D).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { toProfileCard } from '@/lib/server/profile/card';
import { getPremiumUserIds } from '@/lib/server/subscriptions/premium-status';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const rows = await prisma.blockedUser.findMany({
      where: { blockerId: auth.user.sub },
      include: {
        blocked: {
          include: {
            profile: {
              include: {
                photos: { where: { isPrimary: true }, take: 1, include: { fileUpload: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const eligible = rows.filter((r) => r.blocked.profile);
    const premiumIds = await getPremiumUserIds(
      prisma,
      eligible.map((r) => r.blockedId),
    );
    const blocked = eligible.map((r) => ({
      userId: r.blockedId,
      profile: { ...toProfileCard(r.blocked.profile!), isPremium: premiumIds.has(r.blockedId) },
    }));

    return NextResponse.json(
      { blocked },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
