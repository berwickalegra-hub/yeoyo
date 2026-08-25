// POST /api/credits/spend — generic "unlock this list for the current page
// view" spend, for actions that have no other side effect than debiting
// credits (view_visitors, view_favorited_by). Boost and first_message have
// their own routes (profile/boost, conversations/[id]/messages) because
// they also need to write something else (boostedUntil, the Message row)
// in the same transaction as the spend.
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

    const result = await spendCredits(prisma, {
      userId: auth.user.sub,
      action: parsed.data.action,
      role: user?.role ?? null,
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
