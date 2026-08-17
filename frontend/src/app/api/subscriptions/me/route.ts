// GET /api/subscriptions/me — the caller's current subscription (most
// recent non-terminal row, i.e. PENDING or ACTIVE), or null if on the free
// tier. Drives Paramètres' "Plan actuel" section and Premium Checkout's
// "already subscribed" guard.
//
// Admin accounts are always Premium (2026-08-17, explicit user ask — lets
// the account owner preview/test the Premium UI without paying). Self-heals
// right here rather than in a migration or cron: this route is polled by
// every page via PremiumContext, so an ADMIN/SUPERADMIN without an ACTIVE
// Subscription gets one transparently on their next poll. Every other
// Premium check (message quotas, profile badges) reads the same
// Subscription row, so nothing else needs role-awareness bolted on.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getPlan } from '@/lib/server/subscriptions/plans';

const ADMIN_ALWAYS_PREMIUM_PLAN_ID = '6m';
const ADMIN_ALWAYS_PREMIUM_PROVIDER = 'admin-grant';
// Far enough out that "always" doesn't need periodic re-healing in practice.
const ADMIN_ALWAYS_PREMIUM_DAYS = 36_500;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const [user, existingSubscription, profile] = await Promise.all([
      prisma.user.findUnique({ where: { id: auth.user.sub }, select: { role: true } }),
      prisma.subscription.findFirst({
        where: { userId: auth.user.sub, status: { in: ['PENDING', 'ACTIVE'] } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.profile.findUnique({
        where: { userId: auth.user.sub },
        select: { phone: true, phoneCountry: true },
      }),
    ]);

    let subscription = existingSubscription;
    const isAlwaysPremiumRole = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
    if (isAlwaysPremiumRole && subscription?.status !== 'ACTIVE') {
      const currentPeriodEnd = new Date(
        Date.now() + ADMIN_ALWAYS_PREMIUM_DAYS * 24 * 60 * 60 * 1000,
      );
      subscription = subscription
        ? await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              status: 'ACTIVE',
              planId: ADMIN_ALWAYS_PREMIUM_PLAN_ID,
              provider: ADMIN_ALWAYS_PREMIUM_PROVIDER,
              currentPeriodEnd,
              cancelAtPeriodEnd: false,
            },
          })
        : await prisma.subscription.create({
            data: {
              userId: auth.user.sub,
              planId: ADMIN_ALWAYS_PREMIUM_PLAN_ID,
              status: 'ACTIVE',
              provider: ADMIN_ALWAYS_PREMIUM_PROVIDER,
              currentPeriodEnd,
            },
          });
    }

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
