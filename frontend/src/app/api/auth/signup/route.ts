// AUTH-01 — POST /api/auth/signup
//
// Enumeration-resistant: returns identical 201 { ok: true } whether the email
// is new or already exists (D-22). Genuinely new users get a User row, an
// EMAIL_VERIFY VerificationCode, and an outbox email event — all in one tx.
// Existing-email branch runs `dummyBcryptCompare` so the request takes
// ~the same time as the new-user branch (timing parity).
//
// CSRF carve-out: signup is a pre-session route — no CSRF cookie exists yet,
// so calling verifyCsrf would 403 every legitimate request. The CSRF cookie is
// set on session establishment (verify-email / login / refresh).
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { hashPassword, generateVerificationCode } from '@/lib/server/auth';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';
import { dummyBcryptCompare } from '@/lib/server/auth/dummy-bcrypt';
import { verifyTurnstileToken } from '@/lib/server/auth/turnstile';
import { enqueueOutbox } from '@/lib/server/outbox';
import { drainOutboxNow } from '@/lib/server/outbox/drain-now';
import { grantCredits, WELCOME_GIFT_CREDITS } from '@/lib/server/credits/ledger';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);
const VERIFICATION_TTL_MS = Number(process.env.AUTH_VERIFICATION_TTL_MIN ?? 15) * 60 * 1000;

const Body = z.object({
  email: zEmail,
  password: z.string().min(1),
  // Optional affiliate referral code from the signup form (prefilled from
  // ?promo= on the onboarding URL, or typed manually). Case-insensitive —
  // normalized to uppercase before lookup since generateUniqueAffiliateCode
  // only ever produces uppercase codes.
  promoCode: z.string().trim().optional(),
  // Cloudflare Turnstile widget token. Optional in the schema so the field is
  // a no-op when Turnstile is not configured; verifyTurnstileToken() decides
  // whether it's actually required (it is, iff TURNSTILE_SECRET_KEY is set).
  turnstileToken: z.string().optional(),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'auth:signup',
  windowMs: 60 * 60 * 1000, // 1 hour (D-08)
  max: Number(process.env.AUTH_SIGNUP_RATE_LIMIT_MAX ?? 5),
  code: 'TOO_MANY_SIGNUP_ATTEMPTS',
  message: 'Trop de tentatives. Réessaie dans quelques minutes.',
});

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    // 1. Body parse + Zod validation.
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      const res = NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Merci de vérifier ton adresse email.',
          issues: formatIssues(parsed.error),
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    const { email, password, promoCode, turnstileToken } = parsed.data;

    // 1b. Anti-bot check (Cloudflare Turnstile). No-op unless TURNSTILE_SECRET_KEY
    //     is set. Runs before any DB work so bot traffic is rejected cheaply.
    //     Email-independent, so it doesn't affect the enumeration-resistance of
    //     the new-user / existing-user branches below.
    const captcha = await verifyTurnstileToken(
      turnstileToken,
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    );
    if (!captcha.ok) {
      log.warn('signup blocked by turnstile', { reason: captcha.reason });
      const res = NextResponse.json(
        {
          error: 'CAPTCHA_FAILED',
          message: 'Vérification anti-robot échouée. Recharge la page et réessaie.',
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    // 2. Password policy gates BEFORE looking up user (D-22 — keep the no-user
    //    and existing-user branches symmetric below).
    //    Banned check runs before length so a common short password ("password")
    //    surfaces the more specific PASSWORD_BANNED code rather than TOO_SHORT.
    if (isBanned(password)) {
      const res = NextResponse.json(
        {
          error: 'PASSWORD_BANNED',
          message: 'Ce mot de passe est trop courant. Choisis-en un autre.',
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (password.length < PASSWORD_MIN) {
      const res = NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`,
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (process.env.PASSWORD_HIBP_CHECK === '1' && (await isPwned(password))) {
      const res = NextResponse.json(
        {
          error: 'PASSWORD_PWNED',
          message:
            'Ce mot de passe est apparu dans une fuite de données connue. Choisis-en un autre.',
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    // 3. Per-email rate limit.
    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    // 4. Existing-email branch — return identical 201 with timing parity (D-22).
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      await dummyBcryptCompare(password);
      log.info('signup duplicate (enumeration-resist)');
      const res = NextResponse.json({ ok: true }, { status: 201 });
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    // 5. New-user branch — hash + create User + VerificationCode + outbox.
    const passwordHash = await hashPassword(password);
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

    // Resolve the referring user BEFORE the transaction — a bad/unknown
    // code must NEVER block or error signup, so this is a plain best-effort
    // lookup, not a guard. Any account with an affiliateCode can refer
    // (2026-08-31 — previously AFFILIATE-role only). What the referrer
    // earns for it depends on their role, decided later at verification
    // time — see POST /api/admin/verification-queue/[id]/process.
    let referredByAffiliateId: string | undefined;
    if (promoCode) {
      const referrer = await prisma.user.findUnique({
        where: { affiliateCode: promoCode.toUpperCase() },
        select: { id: true },
      });
      if (referrer) {
        referredByAffiliateId = referrer.id;
      }
    }

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, ...(referredByAffiliateId ? { referredByAffiliateId } : {}) },
        select: { id: true },
      });
      await tx.verificationCode.create({
        data: {
          userId: user.id,
          code,
          type: 'EMAIL_VERIFY',
          expiresAt,
        },
      });
      await enqueueOutbox(tx, {
        kind: 'email.verification_code',
        payload: {
          to: email,
          code,
          expiresAt: expiresAt.toISOString(),
        },
      });
      // One-time welcome gift — every new account, regardless of gender,
      // gets this exactly once (same transaction as user creation, so it's
      // impossible for the account to exist without it). Usable exactly
      // like purchased credits (spendCredits doesn't distinguish origin);
      // never re-granted (no other call site references WELCOME_GIFT) and
      // never combined with a purchase beyond landing in the same balance.
      await grantCredits(tx, {
        userId: user.id,
        amount: WELCOME_GIFT_CREDITS,
        type: 'WELCOME_GIFT',
        action: 'welcome_gift',
      });
    });

    // The user is staring at a "check your email" screen right now — don't
    // make them wait for the once-daily cron (see drain-now.ts). Best-effort:
    // never blocks or fails the signup response.
    await drainOutboxNow(email);

    log.info('signup new user');
    const res = NextResponse.json({ ok: true }, { status: 201 });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
  });
}
