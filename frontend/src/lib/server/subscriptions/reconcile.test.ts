import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

vi.mock('@/lib/server/payments/chariow-singleton', () => ({
  getChariowEnv: vi.fn(() => ({
    CHARIOW_API_URL: 'https://api.chariow.test',
    CHARIOW_API_KEY: 'k',
    CHARIOW_WEBHOOK_SECRET: 's',
  })),
  chariowBreaker: { execute: (fn: () => unknown) => fn() },
}));

const getSaleStatusMock = vi.fn();
vi.mock('@/lib/server/payments/chariow', () => ({
  getSaleStatus: (...args: unknown[]) => getSaleStatusMock(...args),
}));

import { reconcileChariowOrder } from './reconcile';

function makePrisma(overrides: {
  order: Record<string, unknown> | null;
  updateManyCount?: number;
  subUpdateManyCount?: number;
  freshSubStatus?: string;
}) {
  const orderUpdateMany = vi.fn(async () => ({ count: overrides.updateManyCount ?? 1 }));
  const subscriptionUpdate = vi.fn(async () => ({}));
  const subscriptionUpdateMany = vi.fn(async () => ({ count: overrides.subUpdateManyCount ?? 1 }));
  const subscriptionFindUnique = vi.fn(async () => ({ status: overrides.freshSubStatus ?? null }));
  const outboxCreate = vi.fn(async () => ({ id: 'ob1' }));
  const orderFindUnique = vi.fn(async () => overrides.order);

  const prisma = {
    order: { findUnique: orderFindUnique, updateMany: orderUpdateMany },
    subscription: { update: subscriptionUpdate },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        order: { updateMany: orderUpdateMany, findUnique: orderFindUnique },
        subscription: {
          update: subscriptionUpdate,
          updateMany: subscriptionUpdateMany,
          findUnique: subscriptionFindUnique,
        },
        outboxEvent: { create: outboxCreate },
      }),
    ),
  } as unknown as PrismaClient;

  return {
    prisma,
    orderUpdateMany,
    subscriptionUpdate,
    subscriptionUpdateMany,
    subscriptionFindUnique,
    outboxCreate,
    orderFindUnique,
  };
}

beforeEach(() => {
  getSaleStatusMock.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('reconcileChariowOrder', () => {
  it.each(['PAID', 'FAILED', 'CANCELLED'])(
    'is a no-op (returns current state) when the Order is terminal (%s)',
    async (status) => {
      const { prisma } = makePrisma({
        order: { id: 'o1', status, subscription: { status: 'ACTIVE' } },
      });
      const result = await reconcileChariowOrder(prisma, 'o1');
      expect(result).toEqual({ orderStatus: status, subscriptionStatus: 'ACTIVE' });
      expect(getSaleStatusMock).not.toHaveBeenCalled();
    },
  );

  it('does NOT no-op on an EXPIRED Order — it still re-pulls Chariow and credits a late settlement', async () => {
    const settledAt = new Date('2026-08-10T12:00:00.000Z');
    getSaleStatusMock.mockResolvedValueOnce({
      status: 'succeeded',
      amount: 399,
      currency: 'USD',
      settledAt,
    });
    const { prisma, orderUpdateMany, subscriptionUpdateMany } = makePrisma({
      order: {
        id: 'o1',
        status: 'EXPIRED', // order-expiration cron already flipped it
        providerChargeId: 'sale_1',
        amount: 399,
        currency: 'USD',
        userId: 'u1',
        customerEmail: 'a@b.com',
        createdAt: new Date('2026-08-09T00:00:00.000Z'),
        subscription: { id: 'sub1', status: 'PENDING', planId: '1m' },
      },
    });

    const result = await reconcileChariowOrder(prisma, 'o1');

    expect(getSaleStatusMock).toHaveBeenCalled();
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'PAID', paidAt: settledAt },
    });
    expect(subscriptionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'sub1', status: 'PENDING' },
      data: {
        status: 'ACTIVE',
        currentPeriodEnd: new Date(settledAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    expect(result).toEqual({ orderStatus: 'PAID', subscriptionStatus: 'ACTIVE' });
  });

  it('marks an EXPIRED Order FAILED when Chariow reports the sale actually failed', async () => {
    getSaleStatusMock.mockResolvedValueOnce({
      status: 'abandoned',
      amount: 399,
      currency: 'USD',
      settledAt: null,
    });
    const { prisma, orderUpdateMany } = makePrisma({
      order: {
        id: 'o1',
        status: 'EXPIRED',
        providerChargeId: 'sale_1',
        amount: 399,
        currency: 'USD',
        createdAt: new Date(),
        subscription: { id: 'sub1', status: 'PENDING', planId: '1m' },
      },
    });

    await reconcileChariowOrder(prisma, 'o1');

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'FAILED' },
    });
  });

  it('marks Order FAILED and Subscription CANCELLED when Chariow reports failed', async () => {
    getSaleStatusMock.mockResolvedValueOnce({
      status: 'failed',
      amount: 599,
      currency: 'USD',
      settledAt: null,
    });
    const { prisma, orderUpdateMany, subscriptionUpdate } = makePrisma({
      order: {
        id: 'o1',
        status: 'PENDING',
        providerChargeId: 'sale_1',
        amount: 599,
        currency: 'USD',
        userId: 'u1',
        customerEmail: null,
        createdAt: new Date(),
        subscription: { id: 'sub1', status: 'PENDING', planId: '1m' },
      },
    });
    const result = await reconcileChariowOrder(prisma, 'o1');
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'FAILED' },
    });
    expect(subscriptionUpdate).toHaveBeenCalledWith({
      where: { id: 'sub1' },
      data: { status: 'CANCELLED' },
    });
    expect(result).toEqual({ orderStatus: 'FAILED', subscriptionStatus: 'CANCELLED' });
  });

  it('does nothing when Chariow still reports pending', async () => {
    getSaleStatusMock.mockResolvedValueOnce({
      status: 'pending',
      amount: 599,
      currency: 'USD',
      settledAt: null,
    });
    const { prisma, orderUpdateMany } = makePrisma({
      order: {
        id: 'o1',
        status: 'PENDING',
        providerChargeId: 'sale_1',
        amount: 599,
        currency: 'USD',
        subscription: { id: 'sub1', status: 'PENDING', planId: '1m' },
      },
    });
    const result = await reconcileChariowOrder(prisma, 'o1');
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ orderStatus: 'PENDING', subscriptionStatus: 'PENDING' });
  });

  it("judges the remote amount against the PLAN price, not against Order.amount (which is Chariow's own figure)", async () => {
    // Chariow reports 200 cents and Order.amount was ALSO overwritten with
    // Chariow's own 200 at checkout time. Comparing the two would show zero
    // drift and credit a mispriced product. The plan ("1m" = 399 cents) is
    // the only trustworthy reference, and 200 vs 399 is far past 5%.
    getSaleStatusMock.mockResolvedValueOnce({
      status: 'succeeded',
      amount: 200,
      currency: 'USD',
      settledAt: null,
    });
    const { prisma, orderUpdateMany } = makePrisma({
      order: {
        id: 'o1',
        status: 'PENDING',
        providerChargeId: 'sale_1',
        amount: 200, // identical to the remote figure — self-consistent, still fraudulent
        currency: 'USD',
        subscription: { id: 'sub1', status: 'PENDING', planId: '1m' },
      },
    });
    const result = await reconcileChariowOrder(prisma, 'o1');
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ orderStatus: 'PENDING', subscriptionStatus: 'PENDING' });
  });

  it('does NOT credit when the Subscription references an unknown planId (no price to compare against)', async () => {
    getSaleStatusMock.mockResolvedValueOnce({
      status: 'succeeded',
      amount: 399,
      currency: 'USD',
      settledAt: null,
    });
    const { prisma, orderUpdateMany } = makePrisma({
      order: {
        id: 'o1',
        status: 'PENDING',
        providerChargeId: 'sale_1',
        amount: 399,
        currency: 'USD',
        subscription: { id: 'sub1', status: 'PENDING', planId: 'legacy-plan-gone' },
      },
    });
    const result = await reconcileChariowOrder(prisma, 'o1');
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ orderStatus: 'PENDING', subscriptionStatus: 'PENDING' });
  });

  it('credits Order + Subscription on a matching succeeded sale, using the provider settledAt (never new Date())', async () => {
    const settledAt = new Date('2026-08-10T12:00:00.000Z');
    getSaleStatusMock.mockResolvedValueOnce({
      status: 'succeeded',
      amount: 399,
      currency: 'USD',
      settledAt,
    });
    const { prisma, orderUpdateMany, subscriptionUpdateMany, outboxCreate } = makePrisma({
      order: {
        id: 'o1',
        status: 'PENDING',
        providerChargeId: 'sale_1',
        amount: 399,
        currency: 'USD',
        userId: 'u1',
        customerEmail: 'a@b.com',
        createdAt: new Date('2026-08-16T00:00:00.000Z'),
        subscription: { id: 'sub1', status: 'PENDING', planId: '1m' },
      },
    });

    const result = await reconcileChariowOrder(prisma, 'o1');

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'PAID', paidAt: settledAt },
    });
    expect(subscriptionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'sub1', status: 'PENDING' },
      data: {
        status: 'ACTIVE',
        currentPeriodEnd: new Date(settledAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    expect(outboxCreate).toHaveBeenCalled();
    expect(result).toEqual({ orderStatus: 'PAID', subscriptionStatus: 'ACTIVE' });
  });

  it('does NOT reactivate a Subscription that was superseded (no longer PENDING) even when the settlement is genuine', async () => {
    // The user abandoned this checkout, re-subscribed on a different plan
    // (which cancels this Subscription — see checkout route's supersede
    // branch), and THEN the original Chariow sale settled late. The Order
    // still gets marked PAID for accounting, but a dead Subscription must
    // never be silently resurrected to ACTIVE.
    const settledAt = new Date('2026-08-20T12:00:00.000Z');
    getSaleStatusMock.mockResolvedValueOnce({
      status: 'succeeded',
      amount: 399,
      currency: 'USD',
      settledAt,
    });
    const {
      prisma,
      orderUpdateMany,
      subscriptionUpdateMany,
      subscriptionFindUnique,
      outboxCreate,
    } = makePrisma({
      order: {
        id: 'o1',
        status: 'EXPIRED',
        providerChargeId: 'sale_1',
        amount: 399,
        currency: 'USD',
        userId: 'u1',
        customerEmail: 'a@b.com',
        createdAt: new Date('2026-08-09T00:00:00.000Z'),
        subscription: { id: 'sub1', status: 'CANCELLED', planId: '1m' },
      },
      subUpdateManyCount: 0, // already superseded — the CAS predicate (status: 'PENDING') matches nothing
      freshSubStatus: 'CANCELLED',
    });

    const result = await reconcileChariowOrder(prisma, 'o1');

    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'PAID', paidAt: settledAt },
    });
    expect(subscriptionUpdateMany).toHaveBeenCalledWith({
      where: { id: 'sub1', status: 'PENDING' },
      data: {
        status: 'ACTIVE',
        currentPeriodEnd: new Date(settledAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    expect(subscriptionFindUnique).toHaveBeenCalledWith({ where: { id: 'sub1' } });
    expect(outboxCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ orderStatus: 'PAID', subscriptionStatus: 'CANCELLED' });
  });

  it('is idempotent: a lost compare-and-swap race (another writer already credited) does not double-activate', async () => {
    getSaleStatusMock.mockResolvedValueOnce({
      status: 'succeeded',
      amount: 399,
      currency: 'USD',
      settledAt: new Date(),
    });
    const { prisma, subscriptionUpdate, subscriptionUpdateMany, orderFindUnique } = makePrisma({
      order: {
        id: 'o1',
        status: 'PENDING',
        providerChargeId: 'sale_1',
        amount: 399,
        currency: 'USD',
        createdAt: new Date(),
        subscription: { id: 'sub1', status: 'ACTIVE', planId: '1m' },
      },
      updateManyCount: 0, // simulates another writer having already flipped status
    });
    orderFindUnique.mockResolvedValueOnce({
      id: 'o1',
      status: 'PENDING',
      providerChargeId: 'sale_1',
      amount: 399,
      currency: 'USD',
      createdAt: new Date(),
      subscription: { id: 'sub1', status: 'ACTIVE', planId: '1m' },
    }); // first call: outer read
    orderFindUnique.mockResolvedValueOnce({
      id: 'o1',
      status: 'PAID',
      subscription: { id: 'sub1', status: 'ACTIVE' },
    }); // second call: inside the tx, re-read after losing the CAS

    const result = await reconcileChariowOrder(prisma, 'o1');
    expect(subscriptionUpdate).not.toHaveBeenCalled();
    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ orderStatus: 'PAID', subscriptionStatus: 'ACTIVE' });
  });
});
