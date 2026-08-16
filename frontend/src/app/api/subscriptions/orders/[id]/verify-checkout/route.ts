// POST /api/subscriptions/orders/[id]/verify-checkout — called by the
// Premium Checkout "pending" page while polling. Unlike a passive GET, this
// actively forces a re-pull of the real status from Chariow via
// reconcileChariowOrder, so a real payment confirms as fast as Chariow's
// own API responds instead of waiting for the webhook or the cron.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { reconcileChariowOrder } from '@/lib/server/subscriptions/reconcile';
import { ChariowProviderUnconfiguredError } from '@/lib/server/payments/chariow-singleton';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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
    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, userId: true, provider: true },
    });
    // A non-Chariow order is treated exactly like a missing one (404, never
    // a distinct code) so this endpoint leaks neither the order's existence
    // nor which provider it belongs to — and so a foreign-provider id can
    // never reach reconcileChariowOrder, which only knows how to talk to
    // Chariow.
    if (!order || order.userId !== auth.user.sub || order.provider !== 'chariow') {
      return NextResponse.json(
        { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let result;
    try {
      result = await reconcileChariowOrder(prisma, id);
    } catch (err) {
      // Same clean 503 the checkout route returns, instead of a raw 500.
      if (err instanceof ChariowProviderUnconfiguredError) {
        return NextResponse.json(
          { code: 'PAYMENT_PROVIDER_UNCONFIGURED', message: err.message },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
    return NextResponse.json(result, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
