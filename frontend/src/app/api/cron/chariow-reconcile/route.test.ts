import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const reconcileMock = vi.fn();
vi.mock('@/lib/server/subscriptions/reconcile', () => ({
  reconcileChariowOrder: (...args: unknown[]) => reconcileMock(...args),
}));

const orderFindMany = vi.fn();
vi.mock('@/lib/server/prisma', () => ({
  prisma: { order: { findMany: (...a: unknown[]) => orderFindMany(...a) } },
}));

vi.mock('@/lib/server/redis', () => ({ redis: null }));

function req(auth?: string) {
  return new NextRequest('http://localhost/api/cron/chariow-reconcile', {
    method: 'POST',
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'cron-secret');
  orderFindMany.mockReset();
  reconcileMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/cron/chariow-reconcile', () => {
  it('returns 401 without a valid Authorization header', async () => {
    const { POST } = await import('./route');
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it('reconciles every PENDING chariow Order and reports how many it processed', async () => {
    orderFindMany.mockResolvedValueOnce([{ id: 'o1' }, { id: 'o2' }]);
    reconcileMock.mockResolvedValue({ orderStatus: 'PENDING', subscriptionStatus: 'PENDING' });

    const { POST } = await import('./route');
    const res = await POST(req('Bearer cron-secret'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, processed: 2 });
    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING', provider: 'chariow' }),
      }),
    );
    expect(reconcileMock).toHaveBeenCalledTimes(2);
  });

  it('keeps going and does not count a row whose reconcile call throws', async () => {
    orderFindMany.mockResolvedValueOnce([{ id: 'o1' }, { id: 'o2' }]);
    reconcileMock.mockRejectedValueOnce(new Error('Chariow API down'));
    reconcileMock.mockResolvedValueOnce({ orderStatus: 'PAID', subscriptionStatus: 'ACTIVE' });

    const { POST } = await import('./route');
    const res = await POST(req('Bearer cron-secret'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, processed: 1 });
  });
});
