// GET /api/credits/me — the caller's credit balance (2026-08-25, replaces
// subscriptions/me/route.ts). Drives the header's persistent balance badge
// and the Credits shop page. ADMIN/SUPERADMIN get `unlimited: true` instead
// of a real balance number — every credit-gated route bypasses the charge
// for these roles via lib/server/credits/ledger.ts's spendCredits, so the
// UI reflects that instead of showing a real (likely 0) balance that would
// misleadingly suggest they could be blocked.
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

    const [user, profile] = await Promise.all([
      prisma.user.findUnique({
        where: { id: auth.user.sub },
        select: { role: true, creditBalance: true },
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
    const unlimited = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

    return NextResponse.json(
      { balance: user?.creditBalance ?? 0, unlimited, savedPhone },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
