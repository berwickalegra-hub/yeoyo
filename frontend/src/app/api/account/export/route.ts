// GET /api/account/export — Paramètres "Télécharger mes données". Returns
// a JSON dump of the caller's own data (never another user's) — passwordHash
// and other internal-only fields are deliberately excluded.
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

    const [user, profile, likesGiven, contactRequests, subscriptions, orders] = await Promise.all([
      prisma.user.findUnique({
        where: { id: auth.user.sub },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      }),
      prisma.profile.findUnique({ where: { userId: auth.user.sub }, include: { photos: true } }),
      prisma.like.findMany({
        where: { likerId: auth.user.sub },
        select: { likedId: true, createdAt: true },
      }),
      prisma.contactRequest.findMany({
        where: { OR: [{ requesterId: auth.user.sub }, { targetId: auth.user.sub }] },
        select: { requesterId: true, targetId: true, status: true, createdAt: true },
      }),
      prisma.subscription.findMany({ where: { userId: auth.user.sub } }),
      prisma.order.findMany({ where: { userId: auth.user.sub } }),
    ]);

    return NextResponse.json(
      {
        exportedAt: new Date().toISOString(),
        user,
        profile,
        likesGiven,
        contactRequests,
        subscriptions,
        orders,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
