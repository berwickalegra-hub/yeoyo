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
    orderFindUnique.mockResolvedValueOnce({ id: 'o1', userId: 'someone-else' });
    const { POST } = await import('./route');
    const res = await POST(req(), { params: Promise.resolve({ id: 'o1' }) });
    expect(res.status).toBe(404);
  });

  it('calls reconcileChariowOrder and returns its result', async () => {
    orderFindUnique.mockResolvedValueOnce({ id: 'o1', userId: 'user-1' });
    reconcileMock.mockResolvedValueOnce({ orderStatus: 'PAID', subscriptionStatus: 'ACTIVE' });
    const { POST } = await import('./route');
    const res = await POST(req(), { params: Promise.resolve({ id: 'o1' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderStatus: 'PAID', subscriptionStatus: 'ACTIVE' });
    expect(reconcileMock).toHaveBeenCalledWith(expect.anything(), 'o1');
  });
});
