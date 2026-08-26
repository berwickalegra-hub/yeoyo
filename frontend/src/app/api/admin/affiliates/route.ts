// POST /api/admin/affiliates — SUPERADMIN-only. Creates an affiliate
// account exactly like /api/admin/invites creates a MODERATOR/ADMIN/
// SUPERADMIN — same AdminInvite table, same hashed-token email flow, same
// pre-session accept route (frontend/src/app/api/admin/invites/accept) —
// just role is hardcoded to 'AFFILIATE' and the audit action is
// 'affiliate.create'. Kept as its own route (not a widened enum on
// /api/admin/invites) so that route's existing behavior/tests stay
// untouched.
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
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48h — same TTL as admin invites

const CreateBody = z.object({
  email: zEmail,
  name: z.string().trim().min(1).max(120),
});

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
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
    const { email, name } = parsed.data;

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const inviteUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/admin/invites/accept?token=${rawToken}`;

    const invite = await prisma.$transaction(async (tx) => {
      const created = await tx.adminInvite.create({
        data: { email, name, role: 'AFFILIATE', tokenHash, invitedById: auth.admin.id, expiresAt },
      });
      await enqueueOutbox(tx, {
        kind: 'email.admin_invite',
        payload: { to: email, inviteUrl, role: 'AFFILIATE', expiresAt: expiresAt.toISOString() },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'affiliate.create',
        targetType: 'AdminInvite',
        targetId: created.id,
        metadata: { email, name },
      });
      return created;
    });

    return NextResponse.json(
      { invite: { id: invite.id, email: invite.email, expiresAt: invite.expiresAt } },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
