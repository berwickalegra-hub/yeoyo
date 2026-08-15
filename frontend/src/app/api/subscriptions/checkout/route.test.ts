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

const profileFindUnique = vi.fn();
const subscriptionFindFirst = vi.fn();
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
      create: vi.fn(async () => ({})),
    },
    order: {
      create: (...a: unknown[]) => orderCreate(...a),
      update: (...a: unknown[]) => orderUpdate(...a),
    },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}));

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
  orderCreate.mockResolvedValue({ id: 'order-1' });
  orderUpdate.mockResolvedValue({});
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
