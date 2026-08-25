// GET /api/credits/packs — the Credits shop catalog (static, see
// lib/server/credits/packs.ts). Prices are the real amount Chariow will
// charge (its own hosted checkout has no arbitrary override — see
// packs.ts's header comment), so no currency conversion happens here.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { PACKS, pricePerCredit } from '@/lib/server/credits/packs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const packs = PACKS.map((p) => ({ ...p, pricePerCredit: pricePerCredit(p) }));

    return NextResponse.json(
      { packs },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
