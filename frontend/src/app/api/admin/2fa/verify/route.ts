// POST /api/admin/2fa/verify — second step of SUPERADMIN login when 2FA is
// enabled. Accepts either a 6-digit TOTP code or a 10-char hex recovery
// code. Locks the challenge after 5 failed attempts (same spirit as the
// email lockout — bounded guesses against a short-lived token).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
  setCsrfCookie,
} from '@/lib/server/auth';
import { verifyTotpCode, verifyRecoveryCode } from '@/lib/server/admin/two-factor';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(6).max(64),
});

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { challengeId, code } = parsed.data;

    // Atomic claim: increments `attempts` and only matches a row that is
    // still unconsumed and under the cap. Concurrent requests against the
    // same challenge can't all read a stale `attempts` value and all slip
    // past the guard — only as many callers as remain under MAX_ATTEMPTS
    // can ever have their `updateMany` match a row (TOCTOU fix, mirrors the
    // claim pattern in outbox/dispatcher.ts).
    const claim = await prisma.adminTwoFactorChallenge.updateMany({
      where: { id: challengeId, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });

    if (claim.count === 0) {
      // The atomic claim didn't match — read once more just to pick the
      // right error code/message. This read is NOT what enforces the cap;
      // the updateMany above already did that atomically.
      const existing = await prisma.adminTwoFactorChallenge.findUnique({
        where: { id: challengeId },
      });
      if (!existing || existing.consumedAt) {
        return NextResponse.json(
          { error: 'CHALLENGE_NOT_FOUND', message: 'Invalid or already-used challenge.' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { error: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts. Log in again.' },
        { status: 429, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const challenge = await prisma.adminTwoFactorChallenge.findUnique({
      where: { id: challengeId },
      include: { user: true },
    });
    if (!challenge) {
      return NextResponse.json(
        { error: 'CHALLENGE_NOT_FOUND', message: 'Invalid or already-used challenge.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'CHALLENGE_EXPIRED', message: 'This login attempt has expired. Log in again.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = challenge.user;
    let ok = false;
    let remainingRecoveryCodes: string[] | null = null;

    if (user.twoFactorSecret && verifyTotpCode(user.twoFactorSecret, code)) {
      ok = true;
    } else {
      const recoveryCodes = (user.twoFactorRecoveryCodes as string[] | null) ?? [];
      const recoveryResult = await verifyRecoveryCode(code, recoveryCodes);
      if (recoveryResult.ok) {
        ok = true;
        remainingRecoveryCodes = recoveryResult.remaining;
      }
    }

    if (!ok) {
      // `attempts` was already incremented atomically by the claim above —
      // no separate update needed here.
      return NextResponse.json(
        { error: 'INVALID_CODE', message: 'Invalid code.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.adminTwoFactorChallenge.update({
      where: { id: challengeId },
      data: { consumedAt: new Date() },
    });
    if (remainingRecoveryCodes !== null) {
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorRecoveryCodes: remainingRecoveryCodes },
      });
    }

    const accessToken = await createAccessToken({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = await createRefreshToken(user.id, user.tokenVersion);
    await setAuthCookies(accessToken, refreshToken);
    await setCsrfCookie();

    return NextResponse.json(
      { ok: true, admin: { id: user.id, email: user.email, role: user.role } },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
