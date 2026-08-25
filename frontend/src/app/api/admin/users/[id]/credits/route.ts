// ADMIN — PATCH /api/admin/users/[id]/credits
//
// Lets an ADMIN directly grant (or correct, via a negative amount) a user's
// credit balance without going through Chariow checkout (2026-08-25,
// replaces .../premium/route.ts now that YeOyo is pay-per-use credits
// instead of a recurring subscription — see lib/server/credits/ledger.ts).
// A grant writes a CreditTransaction row tagged action: 'admin_grant' via
// grantCredits() so it's clearly distinguishable in the DB and in
// /api/admin/audit-log from a real Chariow purchase. Never lets a negative
// amount push the balance below 0 — that's a correction tool, not a way to
// go into debt.
//
// Sequence:
//   makeRequestContext → withRequestContext →
//     verifyCsrf → requireAdmin('ADMIN') → enforceAdminRateLimit →
//     Zod parse → prisma.$transaction(find → guard → grantCredits → logAdminAction)
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { grantCredits } from '@/lib/server/credits/ledger';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  amount: z
    .number()
    .int()
    .refine((n) => n !== 0, 'amount must not be 0'),
});

type Discriminator =
  | { kind: 'NOT_FOUND' }
  | { kind: 'AMOUNT_EXCEEDS_BALANCE'; balance: number }
  | { kind: 'OK'; balance: number };

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const { amount } = parsed.data;

    const result: Discriminator = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, select: { creditBalance: true } });
      if (!target) return { kind: 'NOT_FOUND' as const };

      if (amount < 0 && Math.abs(amount) > target.creditBalance) {
        return { kind: 'AMOUNT_EXCEEDS_BALANCE' as const, balance: target.creditBalance };
      }

      const granted = await grantCredits(tx, {
        userId: id,
        amount,
        type: 'ADMIN_GRANT',
        action: 'admin_grant',
      });

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'user.credits_grant',
        targetType: 'User',
        targetId: id,
        metadata: { amount, balanceAfter: granted.balance },
      });

      return { kind: 'OK' as const, balance: granted.balance };
    });

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (result.kind === 'AMOUNT_EXCEEDS_BALANCE') {
      return NextResponse.json(
        {
          error: 'AMOUNT_EXCEEDS_BALANCE',
          message: 'Cannot remove more credits than the user currently holds',
          balance: result.balance,
        },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return NextResponse.json(
      { balance: result.balance },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
