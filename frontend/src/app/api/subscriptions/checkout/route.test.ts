import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'user-1', email: 'a@b.com' } })),
}));

const chargeMock = vi.fn();
vi.mock('@/lib/server/payments/chariow', () => ({
  charge: (...args: unknown[]) => chargeMock(...args),
  resolveChariowPhone: vi.fn(
    (input: { phoneCountry?: string; phoneLocal?: string; phone?: string }) =>
      input.phoneCountry && input.phoneLocal
        ? { number: input.phoneLocal.replace(/^0/, ''), countryCode: input.phoneCountry }
        : null,
  ),
  getChariowProductId: vi.fn(() => 'prod_123'),
}));

const getChariowEnvMock = vi.fn(() => ({
  CHARIOW_API_URL: 'https://api.chariow.test',
  CHARIOW_API_KEY: 'k',
  CHARIOW_WEBHOOK_SECRET: 's',
}));
vi.mock('@/lib/server/payments/chariow-singleton', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/payments/chariow-singleton')>(
    '@/lib/server/payments/chariow-singleton',
  );
  return {
    ...actual,
    getChariowEnv: () => getChariowEnvMock(),
    chariowBreaker: { execute: (fn: () => unknown) => fn() },
  };
});

const reconcileMock = vi.fn();
vi.mock('@/lib/server/subscriptions/reconcile', () => ({
  reconcileChariowOrder: (...args: unknown[]) => reconcileMock(...args),
}));

const profileFindUnique = vi.fn();
const subscriptionFindFirst = vi.fn();
const subscriptionUpdateMany = vi.fn();
const orderCreate = vi.fn();
const orderUpdate = vi.fn();
const transactionMock = vi.fn(async (..._args: unknown[]) => []);
vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    profile: {
      findUnique: (...a: unknown[]) => profileFindUnique(...a),
      update: vi.fn(async () => ({})),
    },
    subscription: {
      findFirst: (...a: unknown[]) => subscriptionFindFirst(...a),
      updateMany: (...a: unknown[]) => subscriptionUpdateMany(...a),
      create: vi.fn(async () => ({})),
    },
    order: {
      create: (...a: unknown[]) => orderCreate(...a),
      update: (...a: unknown[]) => orderUpdate(...a),
    },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}));

const FUTURE = () => new Date(Date.now() + 20 * 60 * 1000);
const PAST = () => new Date(Date.now() - 60 * 1000);

function req(body: unknown) {
  return new NextRequest('http://localhost/api/subscriptions/checkout', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  profileFindUnique.mockResolvedValue({ userId: 'user-1', firstName: 'Ruth', lastName: 'Thiala' });
  subscriptionFindFirst.mockResolvedValue(null);
  subscriptionUpdateMany.mockResolvedValue({ count: 1 });
  reconcileMock.mockResolvedValue({ orderStatus: 'PENDING', subscriptionStatus: 'PENDING' });
  orderCreate.mockResolvedValue({ id: 'order-1' });
  orderUpdate.mockReset().mockResolvedValue({});
  transactionMock.mockReset().mockResolvedValue([]);
  chargeMock.mockResolvedValue({
    saleId: 'sale_1',
    checkoutUrl: 'https://chariow.test/pay/sale_1',
    amount: 399,
    currency: 'USD',
  });
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/subscriptions/checkout', () => {
  it('returns 400 VALIDATION_FAILED on a malformed body', async () => {
    const { POST } = await import('./route');
    const res = await POST(req({ planId: 'not-a-plan' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION_FAILED');
  });

  it('returns 400 INVALID_PHONE when phone resolution fails', async () => {
    const { POST } = await import('./route');
    const res = await POST(req({ planId: '1m' }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_PHONE');
  });

  it('returns 404 PROFILE_REQUIRED when the caller has no profile', async () => {
    profileFindUnique.mockResolvedValueOnce(null);
    const { POST } = await import('./route');
    const res = await POST(req({ planId: '1m', phoneCountry: 'CD', phoneLocal: '0810000000' }));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('PROFILE_REQUIRED');
  });

  it('returns 409 ALREADY_SUBSCRIBED for an ACTIVE subscription', async () => {
    subscriptionFindFirst.mockResolvedValueOnce({ status: 'ACTIVE', order: null });
    const { POST } = await import('./route');
    const res = await POST(req({ planId: '1m', phoneCountry: 'CD', phoneLocal: '0810000000' }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ALREADY_SUBSCRIBED');
  });

  it('creates an Order, calls Chariow, and returns the real checkout_url on success', async () => {
    const { POST } = await import('./route');
    const res = await POST(req({ planId: '1m', phoneCountry: 'CD', phoneLocal: '0810000000' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({
      orderId: 'order-1',
      paymentUrl: 'https://chariow.test/pay/sale_1',
      status: 'PENDING',
    });
    expect(chargeMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        productId: 'prod_123',
        firstName: 'Ruth',
        lastName: 'Thiala',
        phone: { number: '810000000', countryCode: 'CD' },
      }),
    );
  });

  it('persists providerChargeId on its own write BEFORE the subscription/profile transaction', async () => {
    const calls: string[] = [];
    orderUpdate.mockImplementation(async () => {
      calls.push('order.update');
      return {};
    });
    transactionMock.mockImplementation(async () => {
      calls.push('$transaction');
      return [];
    });

    const { POST } = await import('./route');
    await POST(req({ planId: '1m', phoneCountry: 'CD', phoneLocal: '0810000000' }));

    expect(calls).toEqual(['order.update', '$transaction']);
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        providerChargeId: 'sale_1',
        paymentUrl: 'https://chariow.test/pay/sale_1',
        amount: 399,
        currency: 'USD',
      },
    });
  });

  it('exports a maxDuration above the 30s Chariow HTTP timeout', async () => {
    const mod = (await import('./route')) as { maxDuration?: number };
    expect(mod.maxDuration).toBeGreaterThan(30);
  });

  describe('a previous PENDING subscription', () => {
    it('reuses the existing paymentUrl when it is still live and the SAME plan was requested', async () => {
      subscriptionFindFirst.mockResolvedValueOnce({
        id: 'sub-1',
        status: 'PENDING',
        planId: '1m',
        order: {
          id: 'order-old',
          status: 'PENDING',
          paymentUrl: 'https://chariow.test/pay/old',
          expiresAt: FUTURE(),
        },
      });

      const { POST } = await import('./route');
      const res = await POST(req({ planId: '1m', phoneCountry: 'CD', phoneLocal: '0810000000' }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        orderId: 'order-old',
        paymentUrl: 'https://chariow.test/pay/old',
        status: 'PENDING',
      });
      expect(reconcileMock).toHaveBeenCalledWith(expect.anything(), 'order-old');
      expect(subscriptionUpdateMany).not.toHaveBeenCalled();
      expect(chargeMock).not.toHaveBeenCalled();
    });

    it('returns 409 ALREADY_SUBSCRIBED when the forced reconcile discovers the old attempt actually settled', async () => {
      subscriptionFindFirst.mockResolvedValueOnce({
        id: 'sub-1',
        status: 'PENDING',
        planId: '1m',
        order: {
          id: 'order-old',
          status: 'PENDING',
          paymentUrl: 'https://chariow.test/pay/old',
          expiresAt: FUTURE(),
        },
      });
      reconcileMock.mockResolvedValueOnce({ orderStatus: 'PAID', subscriptionStatus: 'ACTIVE' });

      const { POST } = await import('./route');
      const res = await POST(req({ planId: '1m', phoneCountry: 'CD', phoneLocal: '0810000000' }));

      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('ALREADY_SUBSCRIBED');
      expect(chargeMock).not.toHaveBeenCalled();
    });

    it('supersedes a stale (expired) attempt and proceeds with a fresh checkout', async () => {
      subscriptionFindFirst.mockResolvedValueOnce({
        id: 'sub-1',
        status: 'PENDING',
        planId: '1m',
        order: {
          id: 'order-old',
          status: 'PENDING',
          paymentUrl: 'https://chariow.test/pay/old',
          expiresAt: PAST(),
        },
      });

      const { POST } = await import('./route');
      const res = await POST(req({ planId: '1m', phoneCountry: 'CD', phoneLocal: '0810000000' }));

      expect(subscriptionUpdateMany).toHaveBeenCalledWith({
        where: { id: 'sub-1', status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      expect(res.status).toBe(201);
      expect((await res.json()).paymentUrl).toBe('https://chariow.test/pay/sale_1');
      expect(chargeMock).toHaveBeenCalled();
    });

    it('supersedes an attempt whose Order reconciled to a non-PENDING state', async () => {
      subscriptionFindFirst.mockResolvedValueOnce({
        id: 'sub-1',
        status: 'PENDING',
        planId: '1m',
        order: {
          id: 'order-old',
          status: 'PENDING',
          paymentUrl: 'https://chariow.test/pay/old',
          expiresAt: FUTURE(),
        },
      });
      reconcileMock.mockResolvedValueOnce({
        orderStatus: 'FAILED',
        subscriptionStatus: 'CANCELLED',
      });

      const { POST } = await import('./route');
      const res = await POST(req({ planId: '1m', phoneCountry: 'CD', phoneLocal: '0810000000' }));

      expect(subscriptionUpdateMany).toHaveBeenCalled();
      expect(res.status).toBe(201);
    });

    it('supersedes and re-checks out when a DIFFERENT plan is requested (never returns the old plan url)', async () => {
      subscriptionFindFirst.mockResolvedValueOnce({
        id: 'sub-1',
        status: 'PENDING',
        planId: '1m',
        order: {
          id: 'order-old',
          status: 'PENDING',
          paymentUrl: 'https://chariow.test/pay/old',
          expiresAt: FUTURE(),
        },
      });

      const { POST } = await import('./route');
      const res = await POST(req({ planId: '6m', phoneCountry: 'CD', phoneLocal: '0810000000' }));

      expect(subscriptionUpdateMany).toHaveBeenCalledWith({
        where: { id: 'sub-1', status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.paymentUrl).toBe('https://chariow.test/pay/sale_1');
      expect(json.orderId).toBe('order-1');
      expect(orderCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metadata: { planId: '6m' } }),
        }),
      );
    });

    it('returns 409 CHECKOUT_IN_PROGRESS and does NOT charge when the supersede CAS loses a concurrent race', async () => {
      // Simulates a double-click / two-tab race: another concurrent request
      // already cancelled this Subscription between our read and our own
      // supersede write, so this request's updateMany matches 0 rows.
      // Falling through here would create a second, real Chariow charge.
      subscriptionFindFirst.mockResolvedValueOnce({
        id: 'sub-1',
        status: 'PENDING',
        planId: '1m',
        order: {
          id: 'order-old',
          status: 'PENDING',
          paymentUrl: 'https://chariow.test/pay/old',
          expiresAt: PAST(),
        },
      });
      subscriptionUpdateMany.mockResolvedValueOnce({ count: 0 });

      const { POST } = await import('./route');
      const res = await POST(req({ planId: '1m', phoneCountry: 'CD', phoneLocal: '0810000000' }));

      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('CHECKOUT_IN_PROGRESS');
      expect(chargeMock).not.toHaveBeenCalled();
      expect(orderCreate).not.toHaveBeenCalled();
    });

    it('falls back to local state (does not 500) when the forced reconcile throws', async () => {
      subscriptionFindFirst.mockResolvedValueOnce({
        id: 'sub-1',
        status: 'PENDING',
        planId: '1m',
        order: {
          id: 'order-old',
          status: 'PENDING',
          paymentUrl: 'https://chariow.test/pay/old',
          expiresAt: FUTURE(),
        },
      });
      reconcileMock.mockRejectedValueOnce(new Error('Chariow API down'));

      const { POST } = await import('./route');
      const res = await POST(req({ planId: '1m', phoneCountry: 'CD', phoneLocal: '0810000000' }));

      expect(res.status).toBe(200);
      expect((await res.json()).paymentUrl).toBe('https://chariow.test/pay/old');
    });
  });

  it('marks the Order FAILED and returns 502 PROVIDER_ERROR when Chariow rejects the checkout', async () => {
    chargeMock.mockRejectedValueOnce(new Error('Chariow checkout failed: HTTP 422 — invalid'));
    const { POST } = await import('./route');
    const res = await POST(req({ planId: '1m', phoneCountry: 'CD', phoneLocal: '0810000000' }));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('PROVIDER_ERROR');
    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: 'FAILED' },
    });
  });
});
