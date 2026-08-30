// ADMIN-01 — GET /api/admin/users/[id] (detail).
//
// Sequence: makeRequestContext → withRequestContext → requireAdmin('ADMIN')
// → enforceAdminRateLimit → prisma.user.findUnique with the same PII-safe
// USER_SELECT shape as the list endpoint. 404 on miss with stable code
// USER_NOT_FOUND.
//
// 2026-08-25: `subscription` (recurring-Premium status) replaced by
// `creditBalance` + `recentCreditTransactions` (last 10, newest first) now
// that YeOyo is pay-per-use credits, not a subscription — see
// lib/server/credits/ledger.ts.
//
// DELETE /api/admin/users/[id] — SUPERADMIN-only hard delete (2026-08-30,
// explicit user ask for a way to remove uninteresting accounts). Guards:
// CSRF, SUPERADMIN role, per-actor rate limit, cannot delete self, cannot
// delete a staff account (MODERATOR/ADMIN/SUPERADMIN must be demoted to
// USER first — mirrors the "demote before removing" spirit of the role
// route's last-SUPERADMIN guard), and a typed `confirmEmail` that must
// match the target's address (fat-finger protection, same idea as
// DELETE /api/account). Domain rows cascade via the schema's onDelete
// (Profile, Like, ContactRequest, Conversation/Message, Notification,
// AffiliateEarning, CreditTransaction, …); Order rows go to userId:null
// (financial history kept). AdminAction / AdminInvite / Withdrawal /
// Organization keep onDelete: Restrict — if the target is referenced by
// any of those the delete throws P2003 and we surface a clean 409 telling
// the admin to suspend + demote instead.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  creditBalance: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const [user, recentCreditTransactions] = await Promise.all([
      prisma.user.findUnique({ where: { id }, select: USER_SELECT }),
      prisma.creditTransaction.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, type: true, amount: true, action: true, createdAt: true },
      }),
    ]);
    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return NextResponse.json(
      {
        user,
        recentCreditTransactions: recentCreditTransactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          action: t.action,
          createdAt: t.createdAt.toISOString(),
        })),
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

const DeleteBody = z.object({
  confirmEmail: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (id === auth.admin.id) {
      return NextResponse.json(
        { error: 'CANNOT_DELETE_SELF', message: 'You cannot delete your own account here.' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, creditBalance: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (parsed.data.confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
      return NextResponse.json(
        {
          error: 'EMAIL_CONFIRMATION_MISMATCH',
          message: 'The confirmation email does not match this account.',
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (target.role !== 'USER') {
      return NextResponse.json(
        {
          error: 'CANNOT_DELETE_STAFF',
          message: 'Demote this account to a regular member before deleting it.',
        },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        await logAdminAction(tx, {
          actorId: auth.admin.id,
          action: 'user.delete',
          targetType: 'User',
          targetId: id,
          metadata: {
            email: target.email,
            name: target.name,
            creditBalanceAtDeletion: target.creditBalance,
            ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
          },
        });
        await tx.user.delete({ where: { id } });
      });
    } catch (err) {
      // P2003 — a Restrict relation (AdminAction / AdminInvite / Withdrawal /
      // Organization) still references this user. Surface a clean 409 rather
      // than a 500 — the fix is to suspend + demote instead of hard-deleting.
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: unknown }).code === 'P2003'
      ) {
        return NextResponse.json(
          {
            error: 'ACCOUNT_HAS_HISTORY',
            message:
              'This account is referenced by protected records (admin actions, invites, or withdrawals) and cannot be hard-deleted. Suspend and demote it instead.',
          },
          { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
      throw err;
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
