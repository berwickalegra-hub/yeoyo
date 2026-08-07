// GET /api/subscriptions/orders/[id] — polled by the Premium Checkout
// "pending" page while waiting for payment confirmation. Returns the
// Order + linked Subscription status so the client can detect the
// transition to PAID/ACTIVE without needing a websocket for something
// this infrequent.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
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

    return NextResponse.json(
      {
        orderId: order.id,
        orderStatus: order.status,
        subscriptionStatus: order.subscription?.status ?? null,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
