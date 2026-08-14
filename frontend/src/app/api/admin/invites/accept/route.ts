// POST /api/admin/invites/accept — public (pre-session) route. Sets the
// invitee's password, creates (or promotes) the User row, marks the
// invite accepted. Does NOT issue cookies — the new admin logs in
// separately via /api/admin/login, keeping the two flows independent.
//
// Rate limiting: this route has no `auth.admin` to key a per-userId limiter
// on (D-ADMIN-05 doesn't apply — the caller isn't authenticated yet), and
// the request body carries no email either (just an opaque token), so we
// reuse `createEmailLimiter` keyed by source IP (its documented fallback
// when `email` is null) under a dedicated `admin:invite-accept` bucket —
// mirrors how `/api/admin/login` rate-limits before touching the DB, and
// keeps unbounded token-guessing from an unauthenticated caller off the
// table before any AdminInvite lookup happens.
//
// Race-safety (single-use, expiring, token-gated action — same shape as
// AUTH-03 verify-email / AUTH-08 reset-password): a plain `findUnique` +
// later `update` has a TOCTOU window where two concurrent requests for the
// same token could both pass the acceptedAt/revokedAt/expiresAt checks and
// both mutate. We follow the WR-05 pattern used by verify-email/
// reset-password: the initial `findUnique` below is only used to pick the
// right error code for the common (non-racing) case; the actual state
// transition runs as `updateMany({ where: { id, acceptedAt: null,
// revokedAt: null, expiresAt: { gt: now } }, data: { acceptedAt: now } })`
// inside the same transaction as the User write. If a concurrent request
// already consumed the invite, `count === 0` and we throw a sentinel to
// surface INVITE_ALREADY_ACCEPTED — the second racer can never create a
// second User row or silently re-accept.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { hashPassword } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  token: z.string().min(1),
  password: z.string().min(10),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'admin:invite-accept',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ADMIN_INVITE_ACCEPT_RATE_LIMIT_MAX ?? 10),
  code: 'TOO_MANY_INVITE_ATTEMPTS',
  message: 'Too many invite-accept attempts. Try again later.',
});

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

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
    const { token, password } = parsed.data;

    // No email in the body to key on — bucket by source IP so an
    // unauthenticated caller can't brute-force tokens unbounded.
    const rateFail = await limiter.check(req, null);
    if (rateFail) {
      rateFail.headers.set('x-request-id', ctx.requestId);
      return rateFail;
    }

    const tokenHash = hashToken(token);

    const invite = await prisma.adminInvite.findUnique({ where: { tokenHash } });
    if (!invite) {
      return NextResponse.json(
        { error: 'INVITE_NOT_FOUND', message: 'Invalid invitation link.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (invite.revokedAt) {
      return NextResponse.json(
        { error: 'INVITE_REVOKED', message: 'This invitation has been revoked.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (invite.acceptedAt) {
      return NextResponse.json(
        { error: 'INVITE_ALREADY_ACCEPTED', message: 'This invitation was already used.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'INVITE_EXPIRED', message: 'This invitation has expired.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const passwordHash = await hashPassword(password);
    const existing = await prisma.user.findUnique({ where: { email: invite.email } });

    try {
      await prisma.$transaction(async (tx) => {
        // WR-05-style close of the TOCTOU window between the findUnique
        // above and this write: guard the mutation itself on the same
        // usedAt-style predicate so a concurrent racer sees count === 0
        // instead of also passing the (already-stale) checks above.
        const consumed = await tx.adminInvite.updateMany({
          where: {
            id: invite.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { acceptedAt: new Date() },
        });
        if (consumed.count === 0) {
          throw new Error('INVITE_RACE');
        }

        if (existing) {
          await tx.user.update({
            where: { id: existing.id },
            data: {
              role: invite.role,
              passwordHash,
              emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
            },
          });
        } else {
          await tx.user.create({
            data: {
              email: invite.email,
              passwordHash,
              role: invite.role,
              emailVerifiedAt: new Date(),
            },
          });
        }
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'INVITE_RACE') {
        return NextResponse.json(
          { error: 'INVITE_ALREADY_ACCEPTED', message: 'This invitation was already used.' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
