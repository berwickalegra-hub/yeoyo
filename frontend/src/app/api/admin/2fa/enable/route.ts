// POST /api/admin/2fa/enable — confirms a code against the secret stored
// by /api/admin/2fa/setup, then flips twoFactorEnabled=true.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  verifyCsrf,
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
  setCsrfCookie,
} from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
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

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

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

    // Bump tokenVersion so any OTHER session minted before 2FA was enabled
    // (e.g. one opened while 2FA was off, via a stolen-but-since-rotated
    // password) can't keep riding an old twoFactorVerified:true claim for
    // up to 7 more days — same pattern as change-password/route.ts.
    const updated = await prisma.user.update({
      where: { id: auth.admin.id },
      data: { twoFactorEnabled: true, tokenVersion: { increment: 1 } },
      select: { id: true, email: true, tokenVersion: true },
    });
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'admin.2fa_enabled',
      targetType: 'User',
      targetId: auth.admin.id,
    });

    // Mint fresh cookies with the bumped tokenVersion so the CURRENT
    // browser stays logged in (it just proved a TOTP code, so it's
    // trivially twoFactorVerified) — other sessions fail on their next
    // requireAuth call, same as change-password's Pitfall 9 handling.
    const accessToken = await createAccessToken({
      sub: updated.id,
      email: updated.email,
      tokenVersion: updated.tokenVersion,
      twoFactorVerified: true,
    });
    const refreshToken = await createRefreshToken(updated.id, updated.tokenVersion, true);
    await setAuthCookies(accessToken, refreshToken);
    await setCsrfCookie();

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
