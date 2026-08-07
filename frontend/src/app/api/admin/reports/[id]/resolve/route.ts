// POST /api/admin/reports/[id]/resolve — approve (RESOLVE, action was taken
// against the target) or reject (DISMISS, no action) a report. Idempotent
// no-op on an already-resolved report writes no AdminAction, mirroring the
// user-status route's audit-log-noise guard.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ action: z.enum(['RESOLVE', 'DISMISS']) });

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) {
      return NextResponse.json(
        { error: 'REPORT_NOT_FOUND', message: 'Report not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (report.status !== 'PENDING') {
      return NextResponse.json(
        { report },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const newStatus = parsed.data.action === 'RESOLVE' ? 'RESOLVED' : 'DISMISSED';
    const updated = await prisma.report.update({
      where: { id },
      data: { status: newStatus, resolvedAt: new Date() },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: parsed.data.action === 'RESOLVE' ? 'report.resolve' : 'report.dismiss',
      targetType: 'Report',
      targetId: id,
      metadata: { reportedUserId: report.targetId, reason: report.reason },
    });

    return NextResponse.json(
      { report: updated },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
