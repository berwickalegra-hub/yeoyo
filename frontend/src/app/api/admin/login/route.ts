// POST /api/admin/login — dedicated admin login, separate from
// /api/auth/login. Same credential-check sequence (D-24 enumeration
// resistance: dummy bcrypt on no-user, generic INVALID_CREDENTIALS on both
// "no such user" and "not an admin"), plus a role floor and a 2FA branch
// for SUPERADMIN accounts with twoFactorEnabled.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
  setCsrfCookie,
  verifyPassword,
} from '@/lib/server/auth';
import { isLockedOut, recordFailure, recordSuccess } from '@/lib/server/auth/lockout';
import { dummyBcryptCompare } from '@/lib/server/auth/dummy-bcrypt';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { roleRank, type AdminRole } from '@/lib/server/middleware/require-admin';
import { getRedis } from '@/lib/server/redis';
import { prisma } from '@/lib/server/prisma';
import { zEmail } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const LoginSchema = z.object({
  email: zEmail,
  password: z.string().min(1),
});

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const redis = getRedis() ?? undefined;
const limiter = createEmailLimiter(
  { ...(redis ? { redis } : {}) },
  {
    bucket: 'admin:login',
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX ?? 10),
    code: 'TOO_MANY_LOGIN_ATTEMPTS',
    message: 'Too many login attempts. Try again later.',
  },
);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid JSON body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { email, password } = parsed.data;

    const rl = await limiter.check(req, email);
    if (rl) {
      rl.headers.set('x-request-id', ctx.requestId);
      return rl;
    }

    if (await isLockedOut(email)) {
      log.warn('admin login blocked by lockout', { email });
      return NextResponse.json(
        { error: 'LOCKED_OUT', message: 'Account temporarily locked.' },
        { status: 423, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        status: true,
        tokenVersion: true,
        twoFactorEnabled: true,
      },
    });

    const role = (user?.role as AdminRole | undefined) ?? 'USER';
    const isAdminEligible = user && roleRank(role) >= roleRank('MODERATOR');

    // No-user OR not-admin-enough: same generic error + dummy compare, so
    // an attacker can't distinguish "no account" from "account exists but
    // isn't an admin" (D-24-style enumeration resistance).
    if (!user || !user.passwordHash || !isAdminEligible) {
      await dummyBcryptCompare(password);
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      const r = await recordFailure(email);
      if (r.locked) {
        return NextResponse.json(
          { error: 'LOCKED_OUT', message: 'Account temporarily locked.' },
          { status: 423, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (user.status === 'SUSPENDED') {
      await recordSuccess(email);
      return NextResponse.json(
        { error: 'ACCOUNT_SUSPENDED', message: 'This account has been suspended.' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await recordSuccess(email);

    // SUPERADMIN + 2FA enabled: hold cookies, hand back a challenge instead.
    if (role === 'SUPERADMIN' && user.twoFactorEnabled) {
      const challenge = await prisma.adminTwoFactorChallenge.create({
        data: {
          userId: user.id,
          expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
        },
      });
      return NextResponse.json(
        { twoFactorRequired: true, challengeId: challenge.id },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
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
      { ok: true, admin: { id: user.id, email: user.email, role } },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
