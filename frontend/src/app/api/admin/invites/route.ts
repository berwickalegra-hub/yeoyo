// GET/POST /api/admin/invites — SUPERADMIN-only. GET lists invites
// (cursor-paginated, same shape as other admin listings). POST creates a
// new invite: generates a random token, stores only its SHA-256 hash
// (the raw token is mailed once and never persisted — same threat model
// as a password), enqueues the invite email via the outbox.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { zEmail } from '@/lib/server/zod-helpers';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enqueueOutbox } from '@/lib/server/outbox';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48h

const CreateBody = z.object({
  email: zEmail,
  role: z.enum(['MODERATOR', 'ADMIN', 'SUPERADMIN']),
});

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const rows = await prisma.adminInvite.findMany({
      where: { ...cursorWhere(cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        email: true,
        role: true,
        invitedById: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(buildPage(rows, limit), {
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { email, role } = parsed.data;

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const inviteUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/admin/invites/accept?token=${rawToken}`;

    const invite = await prisma.$transaction(async (tx) => {
      const created = await tx.adminInvite.create({
        data: { email, role, tokenHash, invitedById: auth.admin.id, expiresAt },
      });
      await enqueueOutbox(tx, {
        kind: 'email.admin_invite',
        payload: { to: email, inviteUrl, role, expiresAt: expiresAt.toISOString() },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'admin.invite_created',
        targetType: 'AdminInvite',
        targetId: created.id,
        metadata: { email, role },
      });
      return created;
    });

    return NextResponse.json(
      {
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
        },
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
