import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { spendCredits, grantCredits, CREDIT_COSTS } from './ledger';

beforeEach(() => {
  // prismaMock is reset globally by test-utils/prisma-mock's beforeEach.
});

describe('spendCredits', () => {
  it('ADMIN bypasses the charge entirely — no DB write, ok: true', async () => {
    const result = await spendCredits(prismaMock, {
      userId: 'u1',
      action: 'view_visitors',
      role: 'ADMIN',
    });

    expect(result).toEqual({ ok: true, bypass: true, balance: 0 });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('SUPERADMIN bypasses the charge entirely — no DB write, ok: true', async () => {
    const result = await spendCredits(prismaMock, {
      userId: 'u1',
      action: 'boost',
      role: 'SUPERADMIN',
    });

    expect(result).toEqual({ ok: true, bypass: true, balance: 0 });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('USER role does not bypass — hits the CAS guard', async () => {
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.user.findUnique.mockResolvedValueOnce({ creditBalance: 9 } as never);

    await spendCredits(prismaMock, { userId: 'u1', action: 'view_visitors', role: 'USER' });

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', creditBalance: { gte: CREDIT_COSTS.view_visitors } },
      data: { creditBalance: { decrement: CREDIT_COSTS.view_visitors } },
    });
  });

  it('sufficient balance: decrements via a guarded updateMany and records a SPEND transaction', async () => {
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.user.findUnique.mockResolvedValueOnce({ creditBalance: 4 } as never);

    const result = await spendCredits(prismaMock, {
      userId: 'u1',
      action: 'view_favorited_by',
      role: 'USER',
    });

    expect(result).toEqual({ ok: true, bypass: false, balance: 4 });
    expect(prismaMock.creditTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        type: 'SPEND',
        amount: -CREDIT_COSTS.view_favorited_by,
        action: 'view_favorited_by',
      },
    });
  });

  it('insufficient balance: the CAS matches zero rows, no transaction is written, returns ok: false with the real balance', async () => {
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.user.findUnique.mockResolvedValueOnce({ creditBalance: 2 } as never);

    const result = await spendCredits(prismaMock, { userId: 'u1', action: 'boost', role: 'USER' });

    expect(result).toEqual({ ok: false, bypass: false, balance: 2 });
    expect(prismaMock.creditTransaction.create).not.toHaveBeenCalled();
  });

  it('missing role behaves like a regular user (no bypass)', async () => {
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 0 });
    prismaMock.user.findUnique.mockResolvedValueOnce({ creditBalance: 0 } as never);

    const result = await spendCredits(prismaMock, { userId: 'u1', action: 'first_message' });

    expect(result.ok).toBe(false);
    expect(prismaMock.user.updateMany).toHaveBeenCalled();
  });

  it('uses the correct per-action cost from CREDIT_COSTS for each action', async () => {
    for (const action of Object.keys(CREDIT_COSTS) as (keyof typeof CREDIT_COSTS)[]) {
      prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.user.findUnique.mockResolvedValueOnce({ creditBalance: 100 } as never);

      await spendCredits(prismaMock, { userId: 'u1', action, role: 'USER' });

      expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1', creditBalance: { gte: CREDIT_COSTS[action] } },
        }),
      );
    }
  });
});

describe('grantCredits', () => {
  it('increments the balance and writes a PURCHASE transaction with the related order id', async () => {
    prismaMock.user.update.mockResolvedValueOnce({ creditBalance: 25 } as never);

    const result = await grantCredits(prismaMock, {
      userId: 'u1',
      amount: 25,
      type: 'PURCHASE',
      action: 'credit_pack:serieux',
      relatedOrderId: 'order_1',
    });

    expect(result).toEqual({ balance: 25 });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { creditBalance: { increment: 25 } },
      select: { creditBalance: true },
    });
    expect(prismaMock.creditTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        type: 'PURCHASE',
        amount: 25,
        action: 'credit_pack:serieux',
        relatedOrderId: 'order_1',
      },
    });
  });

  it('ADMIN_GRANT with no relatedOrderId writes null, never undefined', async () => {
    prismaMock.user.update.mockResolvedValueOnce({ creditBalance: 10 } as never);

    await grantCredits(prismaMock, {
      userId: 'u1',
      amount: 10,
      type: 'ADMIN_GRANT',
      action: 'admin_grant',
    });

    expect(prismaMock.creditTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        type: 'ADMIN_GRANT',
        amount: 10,
        action: 'admin_grant',
        relatedOrderId: null,
      },
    });
  });

  it('a negative amount (admin correction) still works — a plain increment with a negative delta', async () => {
    prismaMock.user.update.mockResolvedValueOnce({ creditBalance: 5 } as never);

    const result = await grantCredits(prismaMock, {
      userId: 'u1',
      amount: -5,
      type: 'ADMIN_GRANT',
      action: 'admin_grant',
    });

    expect(result).toEqual({ balance: 5 });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { creditBalance: { increment: -5 } },
      select: { creditBalance: true },
    });
  });
});
