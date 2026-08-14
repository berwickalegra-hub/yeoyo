// POST /api/admin/verification-queue/[id]/process — approve or reject a
// pending profile. `id` is the Profile id. Idempotent no-op if the profile
// already left PENDING (writes no AdminAction, same audit-noise guard as
// the other admin mutation routes).
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

const Body = z.object({ action: z.enum(['APPROVE', 'REJECT']) });

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('MODERATOR');
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

    const profile = await prisma.profile.findUnique({ where: { id } });
    if (!profile) {
      return NextResponse.json(
        { error: 'PROFILE_NOT_FOUND', message: 'Profile not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (profile.verificationStatus !== 'PENDING') {
      return NextResponse.json(
        { profile },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const approve = parsed.data.action === 'APPROVE';
    const updated = await prisma.profile.update({
      where: { id },
      data: {
        verificationStatus: approve ? 'VERIFIED' : 'REJECTED',
        ...(approve ? { verifiedAt: new Date() } : {}),
      },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: approve ? 'profile.verify' : 'profile.reject',
      targetType: 'Profile',
      targetId: id,
      metadata: { userId: profile.userId },
    });

    return NextResponse.json(
      { profile: updated },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
