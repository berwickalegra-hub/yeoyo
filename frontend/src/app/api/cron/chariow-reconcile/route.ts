// Safety-net cron for Chariow credit-pack checkouts. The primary confirmation
// paths are the user-return poll (verify-checkout) and the webhook; this
// catches Orders where BOTH were missed (closed tab, dropped webhook).
//
// It deliberately scans BOTH `PENDING` and `EXPIRED` Orders within a
// 14-day lookback window, not just live PENDING ones. Reason: checkout
// links expire after 30 minutes and the `order-expiration` cron (which
// runs 5 minutes before this one, see vercel.json) has already flipped
// every stale PENDING order of the day to EXPIRED by the time this runs —
// filtering on a live `expiresAt` would exclude exactly the rows this
// cron exists to rescue. `reconcileChariowOrder` re-pulls the real status
// from Chariow and un-expires an order that genuinely settled late
// (Mobile Money settlement can lag), matching Chariow.md's own 14-day
// catch-up window for its FAILED-retry cron.
//
// Runs daily (see vercel.json) — the existing crons in this repo are all
// daily too (Vercel Hobby plan allows at most one run/day per cron); if
// the project moves to Vercel Pro, tighten this to every 5 minutes per the
// original design intent.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { reconcileChariowOrder } from '@/lib/server/credits/reconcile';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;
const BATCH_SIZE = 50;
/** How far back to keep re-checking unsettled Chariow orders (Chariow.md's own catch-up window). */
const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let processed = 0;

    await withLease(redis ?? undefined, 'chariow-reconcile', LEASE_TTL_MS, async () => {
      const pending = await prisma.order.findMany({
        where: {
          status: { in: ['PENDING', 'EXPIRED'] },
          provider: 'chariow',
          createdAt: { gt: new Date(Date.now() - LOOKBACK_MS) },
        },
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
