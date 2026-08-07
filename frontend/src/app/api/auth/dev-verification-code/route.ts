// DEV-ONLY convenience route — surfaces the current EMAIL_VERIFY code for an
// email so the onboarding wizard's "Vérifie ton email" step can display it
// inline while RESEND_API_KEY isn't configured (no real email is ever sent,
// so there's no other way to get the code without a DB client).
//
// TEMPORARY: remove this route + its call site in
// frontend/src/app/onboarding/page.tsx once Resend is wired for real.
// Hard-gated on NODE_ENV so it's a 404 no-op in any production build even if
// the removal is forgotten — exposing verification codes over HTTP defeats
// the anti-account-takeover purpose of email verification.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    const parsedEmail = zEmail.safeParse(req.nextUrl.searchParams.get('email'));
    if (!parsedEmail.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'email query param is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: parsedEmail.data },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json(
        { code: null },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const codeRow = await prisma.verificationCode.findFirst({
      where: { userId: user.id, type: 'EMAIL_VERIFY', usedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { code: true, expiresAt: true },
    });
    if (!codeRow || codeRow.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { code: null },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { code: codeRow.code },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
