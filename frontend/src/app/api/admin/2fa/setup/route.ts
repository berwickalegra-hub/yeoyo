// POST /api/admin/2fa/setup — SUPERADMIN generates a new TOTP secret +
// recovery codes. Stores the encrypted secret immediately but leaves
// twoFactorEnabled=false until /api/admin/2fa/enable confirms a code —
// prevents locking the account out on a QR-scan mistake.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { generateTotpSecret, generateRecoveryCodes } from '@/lib/server/admin/two-factor';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

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

    const qrCodeDataUri = await QRCode.toDataURL(otpauthUri);

    return NextResponse.json(
      { qrCodeDataUri, otpauthUri, recoveryCodes },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
