// POST /api/admin/invites/[id]/revoke — SUPERADMIN-only. Marks a pending
// invite `revokedAt` so it can no longer be accepted (the accept route
// checks `revokedAt` before honoring a token). Idempotent-ish: revoking an
// already-revoked invite just re-stamps `revokedAt` — the accept route is
// the sole place that treats invite state as security-relevant, so there's
// no double-revoke hazard here.
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
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    // D-ADMIN-05 — every admin mutation route rate-limits by actor userId.
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const invite = await prisma.adminInvite.findUnique({ where: { id } });
    if (!invite) {
      return NextResponse.json(
        { error: 'INVITE_NOT_FOUND', message: 'Invite not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.adminInvite.update({ where: { id }, data: { revokedAt: new Date() } });
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'admin.invite_revoked',
      targetType: 'AdminInvite',
      targetId: id,
      metadata: { email: invite.email },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
