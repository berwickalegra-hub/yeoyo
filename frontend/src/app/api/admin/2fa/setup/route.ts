// POST /api/admin/2fa/setup — SUPERADMIN generates a new TOTP secret +
// recovery codes. Stores the encrypted secret immediately but leaves
// twoFactorEnabled=false until /api/admin/2fa/enable confirms a code —
// prevents locking the account out on a QR-scan mistake.
//
// If 2FA is ALREADY enabled, re-issuing a secret here would flip
// twoFactorEnabled back to false as a side effect — i.e. this route would
// become an unauthenticated-relative-to-disable side door for turning 2FA
// off (no password, no TOTP check, unlike disable/route.ts). So when the
// admin's current twoFactorEnabled is true, this route requires the
// account password (same defense-in-depth disable/route.ts uses) before
// rotating anything, and always leaves an audit trail either way.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import QRCode from 'qrcode';
import { verifyCsrf, verifyPassword } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { generateTotpSecret, generateRecoveryCodes } from '@/lib/server/admin/two-factor';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ password: z.string().min(1).optional() });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    // Body is optional for the common first-time-setup case (no password
    // needed yet), so an empty/absent body is not a validation failure —
    // only checked below if 2FA is already active.
    const parsedBody = Body.safeParse(await req.json().catch(() => ({})));
    const password = parsedBody.success ? parsedBody.data.password : undefined;

    const currentUser = await prisma.user.findUnique({
      where: { id: auth.admin.id },
      select: { twoFactorEnabled: true, passwordHash: true },
    });

    if (currentUser?.twoFactorEnabled) {
      const passwordOk =
        password && currentUser.passwordHash
          ? await verifyPassword(password, currentUser.passwordHash)
          : false;
      if (!passwordOk) {
        return NextResponse.json(
          {
            error: 'INVALID_CREDENTIALS',
            message: 'Password required to reset an active 2FA setup.',
          },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const { encryptedSecret, otpauthUri } = generateTotpSecret(auth.admin.email);
    const { plain: recoveryCodes, hashed } = generateRecoveryCodes();

    await prisma.user.update({
      where: { id: auth.admin.id },
      data: {
        twoFactorSecret: encryptedSecret,
        twoFactorEnabled: false,
        twoFactorRecoveryCodes: hashed,
      },
    });
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'admin.2fa_setup_initiated',
      targetType: 'User',
      targetId: auth.admin.id,
    });

    const qrCodeDataUri = await QRCode.toDataURL(otpauthUri);

    return NextResponse.json(
      { qrCodeDataUri, otpauthUri, recoveryCodes },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
