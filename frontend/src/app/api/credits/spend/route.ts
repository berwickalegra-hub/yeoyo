// POST /api/credits/spend — "unlock the favorited-by/visitors list" spend.
// Boost and first_message have their own routes (profile/boost,
// conversations/[id]/messages) because they also need to write something
// else (boostedUntil, the Message row) in the same transaction as the
// spend.
//
// 2026-08-25 (credit gating Script 3): the unlock is now PERMANENT for
// whoever was already revealed at unlock time — a successful spend bumps
// Profile.favoritedByUnlockedAt/visitorsUnlockedAt to now() in the same
// transaction as the credit debit, so a re-fetch of the list (GET
// /api/profile/favorited-by or /visitors) can mark every row up to that
// timestamp as permanently revealed. A NEW favorite/visit created after
// this timestamp shows blurred again and needs its own fresh spend, which
// simply bumps the timestamp further forward (never rewinds it).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { spendCredits } from '@/lib/server/credits/ledger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ action: z.enum(['view_visitors', 'view_favorited_by']) });

const UNLOCK_FIELD: Record<
  'view_visitors' | 'view_favorited_by',
  'visitorsUnlockedAt' | 'favoritedByUnlockedAt'
> = {
  view_visitors: 'visitorsUnlockedAt',
  view_favorited_by: 'favoritedByUnlockedAt',
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: { role: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const spend = await spendCredits(tx, {
        userId: auth.user.sub,
        action: parsed.data.action,
        role: user?.role ?? null,
      });
      // Staff bypass writes nothing to the ledger and needs no unlock
      // marker either — the client never blurs their view (`unlimited`).
      if (spend.ok && !spend.bypass) {
        await tx.profile.update({
          where: { userId: auth.user.sub },
          data: { [UNLOCK_FIELD[parsed.data.action]]: new Date() },
        });
      }
      return spend;
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          code: 'INSUFFICIENT_CREDITS',
          message: 'Solde de crédits insuffisant',
          balance: result.balance,
        },
        { status: 402, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { balance: result.balance, bypass: result.bypass },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
