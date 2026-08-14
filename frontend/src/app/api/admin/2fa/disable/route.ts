// POST /api/admin/2fa/disable — requires BOTH password and a valid TOTP
// code (defense in depth: a stolen session cookie alone can't turn 2FA off).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyCsrf, verifyPassword } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { verifyTotpCode } from '@/lib/server/admin/two-factor';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ password: z.string().min(1), code: z.string().min(6).max(6) });

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
      select: { passwordHash: true, twoFactorSecret: true },
    });
    const passwordOk = user?.passwordHash
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : false;
    const codeOk = user?.twoFactorSecret
      ? verifyTotpCode(user.twoFactorSecret, parsed.data.code)
      : false;

    if (!passwordOk || !codeOk) {
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Invalid password or code.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.user.update({
      where: { id: auth.admin.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        // Runtime value stays plain `null` (matches what the caller reads
        // back from the DB); the cast only satisfies Prisma's Json-field
        // input type, which otherwise wants the `Prisma.JsonNull` sentinel.
        twoFactorRecoveryCodes: null as unknown as Prisma.NullableJsonNullValueInput,
      },
    });
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'admin.2fa_disabled',
      targetType: 'User',
      targetId: auth.admin.id,
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
