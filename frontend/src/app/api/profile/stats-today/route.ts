// GET /api/profile/stats-today — "Mes stats du jour" side panel on
// Explorer (Banani's DiscoverScreen). `likesToday` = Like rows the caller
// gave today, `messagesToday` = Message rows the caller sent today — both
// real, cheap counts (not the fabricated "Ajouts" figure Banani's own mock
// hardcodes). 2026-08-25: messaging has no daily cap anymore (credits only
// gate the first message in a new conversation, see
// lib/server/credits/ledger.ts), so this is now a plain informational
// count, not a quota.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { startOfUtcDay } from '@/lib/server/daily-quota';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const [likesToday, messagesToday] = await Promise.all([
      prisma.like.count({
        where: { likerId: auth.user.sub, createdAt: { gte: startOfUtcDay() } },
      }),
      prisma.message.count({
        where: { senderId: auth.user.sub, createdAt: { gte: startOfUtcDay() } },
      }),
    ]);

    return NextResponse.json(
      { likesToday, messagesToday },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
