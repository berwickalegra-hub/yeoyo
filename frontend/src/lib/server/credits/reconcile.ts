// The single credit point for Chariow credit-pack payments (2026-08-25,
// replaces subscriptions/reconcile.ts). Called by four triggers (user-return
// poll, webhook, safety-net cron, and — unlike the old subscription flow —
// nothing at checkout time anymore, since buying a 2nd pack while a 1st is
// still settling is fine, there's no "already subscribed" exclusivity) and
// NONE of them trust their own trigger source: this function always re-pulls
// the real sale status from Chariow before crediting anything.
//
// It recovers Orders in EITHER `PENDING` or `EXPIRED` state — see
// RECONCILABLE_STATUSES below for why EXPIRED must stay recoverable.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { getChariowEnv, chariowBreaker } from '@/lib/server/payments/chariow-singleton';
import { getSaleStatus } from '@/lib/server/payments/chariow';
import { getPack } from '@/lib/server/credits/packs';
import { grantCredits } from '@/lib/server/credits/ledger';
import { enqueueOutbox } from '@/lib/server/outbox';
import { createLogger } from '@/lib/server/logger';

const logger = createLogger();

/**
 * Anti-fraud tolerance between the pack's EXPECTED price and what Chariow
 * actually reports (Chariow.md §5). The reference is deliberately
 * `pack.priceTotal` (live-verified against the real Chariow product, see
 * packs.ts) and NOT `Order.amount`: the checkout route overwrites
 * `Order.amount` with Chariow's own checkout-time figure, so comparing
 * against it would be checking Chariow's number against itself, and a
 * price silently changed in the Chariow dashboard between checkout and
 * settlement would sail through undetected.
 *
 * `pack.priceTotal` is in whole units of `pack.currency` (XOF has no
 * decimal subunit) — multiplied by 100 here to match `toSmallestUnit`'s
 * convention in chariow.ts, the same convention `remote.amount` already
 * went through. Comparing a *different* currency's number against this one
 * (e.g. a stale USD reference against an XOF-denominated store) is exactly
 * the "bug historique" Chariow.md §11.2 warns never to reintroduce — always
 * keep this reference in the currency the Chariow product is actually
 * configured in, never hardcode "XOF" or any other currency blindly.
 */
const AMOUNT_TOLERANCE = 0.05;

/**
 * Order states this function is allowed to move. EXPIRED is included on
 * purpose: the `order-expiration` cron flips stale PENDING orders to
 * EXPIRED after 30 minutes, but Mobile Money can settle later than that,
 * so an EXPIRED order must stay recoverable if Chariow reports it settled
 * after the fact (mirrors Chariow.md's own "re-verify ≤ 14 days" catch-up
 * philosophy). Anything else (PAID/FAILED/CANCELLED) is terminal.
 */
const RECONCILABLE_STATUSES = ['PENDING', 'EXPIRED'] as const;

export interface ReconcileResult {
  orderStatus: string;
  creditsGranted: number | null;
}

export async function reconcileChariowOrder(
  prisma: PrismaClient,
  orderId: string,
): Promise<ReconcileResult> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error(`reconcileChariowOrder: order ${orderId} not found`);

  const idleResult: ReconcileResult = { orderStatus: order.status, creditsGranted: null };

  if (!(RECONCILABLE_STATUSES as readonly string[]).includes(order.status)) return idleResult;

  const providerChargeId = order.providerChargeId;
  if (!providerChargeId) return idleResult;

  const env = getChariowEnv();
  const remote = await chariowBreaker.execute(() => getSaleStatus(env, providerChargeId));

  if (remote.status === 'failed' || remote.status === 'abandoned') {
    const cas = await prisma.order.updateMany({
      where: { id: order.id, status: { in: [...RECONCILABLE_STATUSES] } },
      data: { status: 'FAILED' },
    });
    return cas.count > 0 ? { orderStatus: 'FAILED', creditsGranted: null } : idleResult;
  }

  if (remote.status !== 'succeeded') return idleResult;

  const packId = (order.metadata as { packId?: string } | null)?.packId;
  const pack = packId ? getPack(packId) : undefined;
  if (!pack) {
    logger.warn('[Chariow] packId inconnu — NON crédité', { orderId: order.id, packId });
    return idleResult;
  }

  const expectedAmount = pack.priceTotal * 100; // toSmallestUnit convention — see chariow.ts
  const drift =
    expectedAmount === 0 ? 0 : Math.abs(remote.amount - expectedAmount) / expectedAmount;
  if (drift > AMOUNT_TOLERANCE) {
    logger.warn('[Chariow] ANOMALIE montant — NON crédité', {
      orderId: order.id,
      expected: expectedAmount,
      expectedCurrency: pack.currency,
      actual: remote.amount,
      actualCurrency: remote.currency,
    });
    return idleResult;
  }
  // Currency label never blocks crediting on its own (Chariow.md §5) — a
  // mismatch here alongside a matching amount is almost always the same
  // number reported under a different label, not fraud — but it's worth
  // surfacing so a real store-currency change doesn't go unnoticed.
  if (remote.currency !== pack.currency) {
    logger.warn('[Chariow] devise inattendue (montant OK, crédité quand même)', {
      orderId: order.id,
      expectedCurrency: pack.currency,
      actualCurrency: remote.currency,
    });
  }

  if (!order.userId) {
    logger.warn('[Chariow] Order payé sans userId — crédits orphelins impossibles', {
      orderId: order.id,
    });
    return idleResult;
  }

  const paidAt = remote.settledAt ?? order.createdAt; // NEVER new Date() on a late catch-up.

  return prisma.$transaction(async (tx) => {
    // The CAS on Order alone is now the sole idempotency guarantee: Order
    // can only ever transition away from PENDING/EXPIRED once, so exactly
    // one of any racing callers (webhook / cron / user poll) wins this
    // update and only that one grants credits. No second row (there is no
    // more Subscription) is needed to guard a double-credit.
    const cas = await tx.order.updateMany({
      where: { id: order.id, status: { in: [...RECONCILABLE_STATUSES] } },
      data: { status: 'PAID', paidAt },
    });

    if (cas.count === 0) {
      // Another writer already handled this order between our read above
      // and this write — do not double-credit.
      const fresh = await tx.order.findUnique({ where: { id: order.id } });
      return { orderStatus: fresh?.status ?? order.status, creditsGranted: null };
    }

    const userId = order.userId as string;
    const { balance } = await grantCredits(tx, {
      userId,
      amount: pack.credits,
      type: 'PURCHASE',
      action: `credit_pack:${pack.id}`,
      relatedOrderId: order.id,
    });

    // Affiliate commission — 15% of the NET amount (after Chariow's own
    // cut), only for a referred HOMME still inside the 30-day window from
    // signup. FEMME purchases never trigger this (messaging is free for
    // them in practice, but the condition stays explicit rather than
    // implicit — see reconcile.ts's design spec §6.2). Idempotence is
    // inherited for free from the Order-status CAS above: this whole
    // function body runs at most once per Order, so no separate guard is
    // needed here (unlike the verification bonus, which CAN legitimately
    // be re-attempted if a future flow resets verificationStatus).
    const referralUser = await tx.user.findUnique({
      where: { id: userId },
      select: {
        createdAt: true,
        referredByAffiliateId: true,
        profile: { select: { gender: true } },
      },
    });
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    if (
      referralUser?.referredByAffiliateId &&
      referralUser.profile?.gender === 'HOMME' &&
      paidAt.getTime() <= referralUser.createdAt.getTime() + THIRTY_DAYS_MS
    ) {
      const rawFeePct = process.env.CHARIOW_PROVIDER_FEE_PCT;
      const feePct = rawFeePct && rawFeePct.trim() !== '' ? Number(rawFeePct) : 15;
      const grossFcfa = Math.round(order.amount / 100); // order.amount is smallest-unit (×100) — see checkout/route.ts
      const netAmount = Math.round(grossFcfa * (1 - feePct / 100));
      const commission = Math.round(netAmount * 0.15);
      await tx.affiliateEarning.create({
        data: {
          affiliateId: referralUser.referredByAffiliateId,
          referredUserId: userId,
          type: 'CREDIT_COMMISSION',
          amount: commission,
          relatedOrderId: order.id,
        },
      });
    }

    await enqueueOutbox(tx, {
      kind: 'notification.payment_received',
      payload: { userId, orderId: order.id, amount: order.amount, currency: order.currency },
    });
    if (order.customerEmail) {
      await enqueueOutbox(tx, {
        kind: 'email.payment_confirmation',
        payload: {
          to: order.customerEmail,
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
        },
      });
    }

    logger.info('[Chariow] Crédits ajoutés', {
      orderId: order.id,
      userId,
      credits: pack.credits,
      balance,
    });
    return { orderStatus: 'PAID', creditsGranted: pack.credits };
  });
}
