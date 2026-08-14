// GET /api/profile/stats-today — "Mes stats du jour" side panel on
// Explorer (Banani's DiscoverScreen). `likesToday` = Like rows the caller
// gave today (a real, cheap count — not the fabricated "Ajouts" figure
// Banani's own mock hardcodes). `messages` reuses the same daily quota
// POST /api/conversations/[id]/messages enforces, so the two never drift.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { startOfUtcDay } from '@/lib/server/daily-quota';
import { messageQuotaStatus } from '@/lib/server/conversations/message-quota';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const [likesToday, messages] = await Promise.all([
      prisma.like.count({
        where: { likerId: auth.user.sub, createdAt: { gte: startOfUtcDay() } },
      }),
      messageQuotaStatus(auth.user.sub),
    ]);

    return NextResponse.json(
      { likesToday, messages },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
