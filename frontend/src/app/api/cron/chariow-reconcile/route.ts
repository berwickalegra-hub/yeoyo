// Safety-net cron for Chariow Premium checkouts. The primary confirmation
// paths are the user-return poll (verify-checkout) and the webhook; this
// catches PENDING Orders where BOTH were missed (closed tab, dropped
// webhook). Runs daily (see vercel.json) — the existing crons in this repo
// are all daily too (Vercel Hobby plan allows at most one run/day per
// cron); if the project moves to Vercel Pro, tighten this to every 5
// minutes per the original design intent.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { reconcileChariowOrder } from '@/lib/server/subscriptions/reconcile';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;
const BATCH_SIZE = 50;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let processed = 0;

    await withLease(redis ?? undefined, 'chariow-reconcile', LEASE_TTL_MS, async () => {
      const pending = await prisma.order.findMany({
        where: { status: 'PENDING', provider: 'chariow', expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
        select: { id: true },
      });

      for (const o of pending) {
        try {
          await reconcileChariowOrder(prisma, o.id);
          processed++;
        } catch (err) {
          log.warn('chariow-reconcile: order failed', { orderId: o.id, err: String(err) });
        }
      }
    });

    return NextResponse.json(
      { ok: true, processed },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
