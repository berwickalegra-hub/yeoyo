// GET /api/subscriptions/me — the caller's current subscription (most
// recent non-terminal row, i.e. PENDING or ACTIVE), or null if on the free
// tier. Drives Paramètres' "Plan actuel" section and Premium Checkout's
// "already subscribed" guard.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getPlan } from '@/lib/server/subscriptions/plans';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const [subscription, profile] = await Promise.all([
      prisma.subscription.findFirst({
        where: { userId: auth.user.sub, status: { in: ['PENDING', 'ACTIVE'] } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.profile.findUnique({
        where: { userId: auth.user.sub },
        select: { phone: true, phoneCountry: true },
      }),
    ]);

    const savedPhone =
      profile?.phone && profile.phoneCountry
        ? { phone: profile.phone, phoneCountry: profile.phoneCountry }
        : null;

    if (!subscription) {
      return NextResponse.json(
        { subscription: null, savedPhone },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const plan = getPlan(subscription.planId);
    return NextResponse.json(
      {
        subscription: {
          id: subscription.id,
          planId: subscription.planId,
          planName: plan?.name ?? subscription.planId,
          status: subscription.status,
          orderId: subscription.orderId,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        },
        savedPhone,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
