// POST /api/admin/affiliates/[id]/mark-paid — SUPERADMIN-only. Solds the
// ENTIRE currently-unpaid balance for one affiliate in a single bulk
// updateMany (no partial payout in V1 — see spec §10). Idempotent in the
// sense that calling it again with nothing newly unpaid updates 0 rows
// and logs amount:0, count:0 rather than erroring.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const affiliate = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!affiliate || affiliate.role !== 'AFFILIATE') {
      return NextResponse.json(
        { error: 'AFFILIATE_NOT_FOUND', message: 'Affiliate not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const unpaid = await tx.affiliateEarning.findMany({
        where: { affiliateId: id, paidAt: null },
        select: { amount: true },
      });
      const totalAmount = unpaid.reduce((sum, e) => sum + e.amount, 0);
      const updated = await tx.affiliateEarning.updateMany({
        where: { affiliateId: id, paidAt: null },
        data: { paidAt: now },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'affiliate.mark_paid',
        targetType: 'User',
        targetId: id,
        metadata: { amount: totalAmount, count: updated.count },
      });
      return { amount: totalAmount, count: updated.count };
    });

    return NextResponse.json(
      { ok: true, ...result, paidAt: now },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
