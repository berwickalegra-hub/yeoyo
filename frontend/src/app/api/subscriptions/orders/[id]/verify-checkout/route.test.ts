import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'user-1', email: 'a@b.com' } })),
}));

const reconcileMock = vi.fn();
vi.mock('@/lib/server/subscriptions/reconcile', () => ({
  reconcileChariowOrder: (...args: unknown[]) => reconcileMock(...args),
}));

const orderFindUnique = vi.fn();
vi.mock('@/lib/server/prisma', () => ({
  prisma: { order: { findUnique: (...a: unknown[]) => orderFindUnique(...a) } },
}));

function req() {
  return new NextRequest('http://localhost/api/subscriptions/orders/o1/verify-checkout', {
    method: 'POST',
  });
}

afterEach(() => vi.clearAllMocks());

describe('POST /api/subscriptions/orders/[id]/verify-checkout', () => {
  it('returns 404 when the order does not belong to the caller', async () => {
    orderFindUnique.mockResolvedValueOnce({
      id: 'o1',
      userId: 'someone-else',
      provider: 'chariow',
    });
    const { POST } = await import('./route');
    const res = await POST(req(), { params: Promise.resolve({ id: 'o1' }) });
    expect(res.status).toBe(404);
  });

  it('returns 404 (not a provider-specific error) for an order from another provider', async () => {
    orderFindUnique.mockResolvedValueOnce({ id: 'o1', userId: 'user-1', provider: 'bictorys' });
    const { POST } = await import('./route');
    const res = await POST(req(), { params: Promise.resolve({ id: 'o1' }) });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('ORDER_NOT_FOUND');
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it('maps ChariowProviderUnconfiguredError to the same 503 the checkout route returns', async () => {
    const { ChariowProviderUnconfiguredError } =
      await import('@/lib/server/payments/chariow-singleton');
    orderFindUnique.mockResolvedValueOnce({ id: 'o1', userId: 'user-1', provider: 'chariow' });
    reconcileMock.mockRejectedValueOnce(new ChariowProviderUnconfiguredError());

    const { POST } = await import('./route');
    const res = await POST(req(), { params: Promise.resolve({ id: 'o1' }) });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('PAYMENT_PROVIDER_UNCONFIGURED');
  });

  it('lets an unexpected reconcile error propagate (not silently 200)', async () => {
    orderFindUnique.mockResolvedValueOnce({ id: 'o1', userId: 'user-1', provider: 'chariow' });
    reconcileMock.mockRejectedValueOnce(new Error('Chariow sale lookup failed: HTTP 500'));
    const { POST } = await import('./route');
    await expect(POST(req(), { params: Promise.resolve({ id: 'o1' }) })).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it('calls reconcileChariowOrder and returns its result', async () => {
    orderFindUnique.mockResolvedValueOnce({ id: 'o1', userId: 'user-1', provider: 'chariow' });
    reconcileMock.mockResolvedValueOnce({ orderStatus: 'PAID', subscriptionStatus: 'ACTIVE' });
    const { POST } = await import('./route');
    const res = await POST(req(), { params: Promise.resolve({ id: 'o1' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderStatus: 'PAID', subscriptionStatus: 'ACTIVE' });
    expect(reconcileMock).toHaveBeenCalledWith(expect.anything(), 'o1');
  });
});
