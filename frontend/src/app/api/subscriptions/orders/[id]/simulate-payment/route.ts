// POST /api/subscriptions/orders/[id]/simulate-payment — STAND-IN for a
// real Stripe/Moneroo webhook. This route exists only because the checkout
// flow is deliberately wired to a stub provider (see lib/server/payments/stub.ts)
// per the explicit decision to build Premium Checkout's UI first and wire a
// real charge later. Delete this route (and let a real webhook handler mark
// the Order PAID instead) once that happens — nothing else in the checkout
// flow needs to change, since the pending page already polls Order/Subscription
// status rather than assuming any particular completion mechanism.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getPlan } from '@/lib/server/subscriptions/plans';

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await routeCtx.params;
    const order = await prisma.order.findUnique({ where: { id }, include: { subscription: true } });
    if (!order || order.userId !== auth.user.sub) {
      return NextResponse.json(
        { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (order.status !== 'PENDING' || !order.subscription) {
      return NextResponse.json(
        { code: 'ORDER_NOT_PENDING', message: 'Order is not awaiting payment' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const plan = getPlan(order.subscription.planId);
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + (plan?.billingMonths ?? 1));

    await prisma.$transaction([
      prisma.order.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } }),
      prisma.subscription.update({
        where: { id: order.subscription.id },
        data: { status: 'ACTIVE', currentPeriodEnd },
      }),
    ]);

    return NextResponse.json(
      { orderStatus: 'PAID', subscriptionStatus: 'ACTIVE' },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
