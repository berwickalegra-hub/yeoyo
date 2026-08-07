// GET /api/subscriptions/plans — the Premium Checkout plan catalog (static,
// see lib/server/subscriptions/plans.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { PLANS, usdCentsToCdfDisplay } from '@/lib/server/subscriptions/plans';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const plans = PLANS.map((p) => ({
      ...p,
      priceCdfDisplayTotal: usdCentsToCdfDisplay(p.priceCentsTotal),
      priceCdfDisplayPerMonth: usdCentsToCdfDisplay(p.priceCentsPerMonth),
    }));

    return NextResponse.json(
      { plans },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
