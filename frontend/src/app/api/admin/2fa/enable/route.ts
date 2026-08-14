// POST /api/admin/2fa/enable — confirms a code against the secret stored
// by /api/admin/2fa/setup, then flips twoFactorEnabled=true.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { verifyTotpCode } from '@/lib/server/admin/two-factor';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ code: z.string().min(6).max(6) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.admin.id },
      select: { twoFactorSecret: true },
    });
    if (!user?.twoFactorSecret || !verifyTotpCode(user.twoFactorSecret, parsed.data.code)) {
      return NextResponse.json(
        { error: 'INVALID_CODE', message: 'Invalid code. Run setup again if needed.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.user.update({
      where: { id: auth.admin.id },
      data: { twoFactorEnabled: true },
    });
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'admin.2fa_enabled',
      targetType: 'User',
      targetId: auth.admin.id,
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
