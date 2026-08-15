// The single credit point for Chariow payments. Called by three triggers
// (user-return poll, webhook, 5-minute cron — see
// docs/superpowers/specs/2026-08-16-chariow-payment-integration-design.md)
// and NONE of them trust their own trigger source: this function always
// re-pulls the real sale status from Chariow before crediting anything.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { getChariowEnv, chariowBreaker } from '@/lib/server/payments/chariow-singleton';
import { getSaleStatus } from '@/lib/server/payments/chariow';
import { getPlan } from '@/lib/server/subscriptions/plans';
import { enqueueOutbox } from '@/lib/server/outbox';
import { createLogger } from '@/lib/server/logger';

const logger = createLogger();

/** Anti-fraud tolerance between Order.amount and what Chariow actually reports (Chariow.md §5.4). */
const AMOUNT_TOLERANCE = 0.05;

export interface ReconcileResult {
  orderStatus: string;
  subscriptionStatus: string | null;
}

export async function reconcileChariowOrder(
  prisma: PrismaClient,
  orderId: string,
): Promise<ReconcileResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { subscription: true },
  });
  if (!order) throw new Error(`reconcileChariowOrder: order ${orderId} not found`);

  const subscription = order.subscription;
  const idleResult: ReconcileResult = {
    orderStatus: order.status,
    subscriptionStatus: subscription?.status ?? null,
  };

  if (order.status !== 'PENDING') return idleResult;

  const providerChargeId = order.providerChargeId;
  if (!providerChargeId) return idleResult;

  const env = getChariowEnv();
  const remote = await chariowBreaker.execute(() => getSaleStatus(env, providerChargeId));

  if (remote.status === 'failed' || remote.status === 'abandoned') {
    const cas = await prisma.order.updateMany({
      where: { id: order.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    if (cas.count > 0 && subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'CANCELLED' },
      });
      return { orderStatus: 'FAILED', subscriptionStatus: 'CANCELLED' };
    }
    return idleResult;
  }

  if (remote.status !== 'succeeded') return idleResult;

  const drift = order.amount === 0 ? 0 : Math.abs(remote.amount - order.amount) / order.amount;
  if (drift > AMOUNT_TOLERANCE) {
    logger.warn('[Chariow] ANOMALIE montant — NON crédité', {
      orderId: order.id,
      expected: order.amount,
      actual: remote.amount,
      currency: remote.currency,
    });
    return idleResult;
  }

  if (!subscription) {
    logger.warn('[Chariow] Order payé sans Subscription liée', { orderId: order.id });
    return idleResult;
  }

  const plan = getPlan(subscription.planId);
  const billingDays = plan?.billingDays ?? 30;
  const paidAt = remote.settledAt ?? order.createdAt; // NEVER new Date() on a late catch-up — see spec pitfall list.
  const currentPeriodEnd = new Date(paidAt.getTime() + billingDays * 24 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const cas = await tx.order.updateMany({
      where: { id: order.id, status: 'PENDING' },
      data: { status: 'PAID', paidAt },
    });

    if (cas.count === 0) {
      // Another writer (webhook / cron / user poll race) already handled this
      // order between our read above and this write — do not double-credit.
      const fresh = await tx.order.findUnique({
        where: { id: order.id },
        include: { subscription: true },
      });
      return {
        orderStatus: fresh?.status ?? order.status,
        subscriptionStatus: fresh?.subscription?.status ?? null,
      };
    }

    await tx.subscription.update({
      where: { id: subscription.id },
      data: { status: 'ACTIVE', currentPeriodEnd },
    });

    if (order.userId) {
      await enqueueOutbox(tx, {
        kind: 'notification.payment_received',
        payload: {
          userId: order.userId,
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
        },
      });
    }
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

    return { orderStatus: 'PAID', subscriptionStatus: 'ACTIVE' };
  });
}
