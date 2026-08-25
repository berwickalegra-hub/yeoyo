import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const reconcileMock = vi.fn();
vi.mock('@/lib/server/credits/reconcile', () => ({
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

  it('reconciles every PENDING *and* EXPIRED chariow Order and reports how many it processed', async () => {
    orderFindMany.mockResolvedValueOnce([{ id: 'o1' }, { id: 'o2' }]);
    reconcileMock.mockResolvedValue({ orderStatus: 'PENDING', creditsGranted: null });

    const { POST } = await import('./route');
    const res = await POST(req('Bearer cron-secret'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, processed: 2 });
    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PENDING', 'EXPIRED'] },
          provider: 'chariow',
        }),
      }),
    );
    expect(reconcileMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT filter on a live expiresAt (that would exclude the rows it exists to rescue)', async () => {
    orderFindMany.mockResolvedValueOnce([]);

    const { POST } = await import('./route');
    await POST(req('Bearer cron-secret'));

    const where = orderFindMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).not.toHaveProperty('expiresAt');
  });

  it('bounds the scan to a 14-day createdAt lookback so it does not grow unbounded', async () => {
    orderFindMany.mockResolvedValueOnce([]);
    const before = Date.now();

    const { POST } = await import('./route');
    await POST(req('Bearer cron-secret'));

    const where = orderFindMany.mock.calls[0]?.[0]?.where as { createdAt: { gt: Date } };
    const cutoff = where.createdAt.gt.getTime();
    const expected = before - 14 * 24 * 60 * 60 * 1000;
    // within a few seconds of "now minus 14 days"
    expect(Math.abs(cutoff - expected)).toBeLessThan(5_000);
  });

  it('keeps going and does not count a row whose reconcile call throws', async () => {
    orderFindMany.mockResolvedValueOnce([{ id: 'o1' }, { id: 'o2' }]);
    reconcileMock.mockRejectedValueOnce(new Error('Chariow API down'));
    reconcileMock.mockResolvedValueOnce({ orderStatus: 'PAID', creditsGranted: 25 });

    const { POST } = await import('./route');
    const res = await POST(req('Bearer cron-secret'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, processed: 1 });
  });
});
