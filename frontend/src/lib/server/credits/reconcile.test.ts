import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/payments/chariow-singleton', () => ({
  getChariowEnv: vi.fn().mockReturnValue({}),
  chariowBreaker: { execute: vi.fn((fn: () => unknown) => fn()) },
}));
vi.mock('@/lib/server/payments/chariow', () => ({ getSaleStatus: vi.fn() }));
vi.mock('@/lib/server/credits/packs', () => ({
  getPack: vi.fn().mockReturnValue({
    id: 'decouverte',
    credits: 5,
    priceTotal: 1000,
    currency: 'XOF',
  }),
}));
vi.mock('@/lib/server/credits/ledger', () => ({
  grantCredits: vi.fn().mockResolvedValue({ balance: 5 }),
}));
vi.mock('@/lib/server/outbox', () => ({ enqueueOutbox: vi.fn() }));

import { getSaleStatus } from '@/lib/server/payments/chariow';
import { reconcileChariowOrder } from './reconcile';
import { seedOrder } from '@/test-utils/admin-fixtures';

const mockGetSaleStatus = vi.mocked(getSaleStatus);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CHARIOW_PROVIDER_FEE_PCT = '18';
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(undefined);
  });
  prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
});

function seedSucceeded(overrides: Partial<{ amount: number; settledAt: Date }> = {}) {
  mockGetSaleStatus.mockResolvedValueOnce({
    status: 'succeeded',
    amount: overrides.amount ?? 100000, // 1000 XOF * 100 (toSmallestUnit)
    currency: 'XOF',
    settledAt: overrides.settledAt ?? new Date('2026-08-20T00:00:00.000Z'),
  } as never);
}

describe('reconcileChariowOrder — affiliate commission', () => {
  it('inserts a 25%-of-net CREDIT_COMMISSION for a referred HOMME inside the 30-day window', async () => {
    seedSucceeded();
    const order = seedOrder({
      id: 'order_1',
      userId: 'user_1',
      status: 'PENDING',
      providerChargeId: 'charge_1',
      amount: 100000,
      metadata: { packId: 'decouverte' },
    });
    prismaMock.order.findUnique.mockResolvedValueOnce(order as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      referredByAffiliateId: 'aff_1',
      profile: { gender: 'HOMME' },
    } as never);
    prismaMock.affiliateEarning.create.mockResolvedValueOnce({} as never);

    const result = await reconcileChariowOrder(prismaMock, 'order_1');
    expect(result.orderStatus).toBe('PAID');
    // order.amount=100000 is smallest-unit (×100) -> grossFcfa = round(100000/100) = 1000
    // netAmount = round(1000 * 0.82) = 820; commission = round(820 * 0.25) = 205
    expect(prismaMock.affiliateEarning.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          affiliateId: 'aff_1',
          referredUserId: 'user_1',
          type: 'CREDIT_COMMISSION',
          amount: 205,
          relatedOrderId: 'order_1',
        }),
      }),
    );
  });

  it('never inserts a commission for a referred FEMME', async () => {
    seedSucceeded();
    const order = seedOrder({
      id: 'order_2',
      userId: 'user_2',
      status: 'PENDING',
      providerChargeId: 'charge_2',
      amount: 100000,
      metadata: { packId: 'decouverte' },
    });
    prismaMock.order.findUnique.mockResolvedValueOnce(order as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      referredByAffiliateId: 'aff_1',
      profile: { gender: 'FEMME' },
    } as never);

    await reconcileChariowOrder(prismaMock, 'order_2');
    expect(prismaMock.affiliateEarning.create).not.toHaveBeenCalled();
  });

  it('never inserts a commission when there is no referring affiliate', async () => {
    seedSucceeded();
    const order = seedOrder({
      id: 'order_3',
      userId: 'user_3',
      status: 'PENDING',
      providerChargeId: 'charge_3',
      amount: 100000,
      metadata: { packId: 'decouverte' },
    });
    prismaMock.order.findUnique.mockResolvedValueOnce(order as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      referredByAffiliateId: null,
      profile: { gender: 'HOMME' },
    } as never);

    await reconcileChariowOrder(prismaMock, 'order_3');
    expect(prismaMock.affiliateEarning.create).not.toHaveBeenCalled();
  });

  it('never inserts a commission once the 30-day window has passed', async () => {
    seedSucceeded({ settledAt: new Date('2026-09-05T00:00:00.000Z') }); // 35 days after signup
    const order = seedOrder({
      id: 'order_4',
      userId: 'user_4',
      status: 'PENDING',
      providerChargeId: 'charge_4',
      amount: 100000,
      metadata: { packId: 'decouverte' },
    });
    prismaMock.order.findUnique.mockResolvedValueOnce(order as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      referredByAffiliateId: 'aff_1',
      profile: { gender: 'HOMME' },
    } as never);

    await reconcileChariowOrder(prismaMock, 'order_4');
    expect(prismaMock.affiliateEarning.create).not.toHaveBeenCalled();
  });

  it('respects a custom CHARIOW_PROVIDER_FEE_PCT', async () => {
    process.env.CHARIOW_PROVIDER_FEE_PCT = '10';
    seedSucceeded();
    const order = seedOrder({
      id: 'order_5',
      userId: 'user_5',
      status: 'PENDING',
      providerChargeId: 'charge_5',
      amount: 100000,
      metadata: { packId: 'decouverte' },
    });
    prismaMock.order.findUnique.mockResolvedValueOnce(order as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      referredByAffiliateId: 'aff_1',
      profile: { gender: 'HOMME' },
    } as never);
    prismaMock.affiliateEarning.create.mockResolvedValueOnce({} as never);

    await reconcileChariowOrder(prismaMock, 'order_5');
    // order.amount=100000 is smallest-unit (×100) -> grossFcfa = round(100000/100) = 1000
    // netAmount = round(1000 * 0.90) = 900; commission = round(900 * 0.25) = 225
    expect(prismaMock.affiliateEarning.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 225 }) }),
    );
  });
});
