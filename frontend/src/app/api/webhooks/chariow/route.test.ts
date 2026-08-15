import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const orderFindFirst = vi.fn();
const reconcileMock = vi.fn();

const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({ webhookLog: { findUnique, create, update } }),
);

vi.mock('@/lib/server/prisma', () => ({
  prisma: { $transaction, order: { findFirst: (...a: unknown[]) => orderFindFirst(...a) } },
}));

vi.mock('@/lib/server/subscriptions/reconcile', () => ({
  reconcileChariowOrder: (...args: unknown[]) => reconcileMock(...args),
}));

beforeEach(() => {
  vi.stubEnv('CHARIOW_WEBHOOK_SECRET', 'test-secret');
  findUnique.mockReset();
  create.mockReset();
  update.mockReset();
  orderFindFirst.mockReset();
  reconcileMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function req(secret: string | null, body: unknown) {
  const url = secret
    ? `http://localhost/api/webhooks/chariow?secret=${encodeURIComponent(secret)}`
    : 'http://localhost/api/webhooks/chariow';
  return new NextRequest(url, { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/webhooks/chariow', () => {
  it('returns 401 when the secret is missing', async () => {
    const { POST } = await import('./route');
    const res = await POST(req(null, {}));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the secret does not match', async () => {
    const { POST } = await import('./route');
    const res = await POST(req('wrong', {}));
    expect(res.status).toBe(401);
  });

  it('accepts a valid secret, dedups via WebhookLog, and reconciles the matching Order after commit', async () => {
    findUnique.mockResolvedValueOnce(null);
    orderFindFirst.mockResolvedValueOnce({ id: 'order-1' });
    reconcileMock.mockResolvedValueOnce({ orderStatus: 'PAID', subscriptionStatus: 'ACTIVE' });

    const { POST } = await import('./route');
    const res = await POST(req('test-secret', { event: 'settled.sale', data: { id: 'sale_1' } }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deduped: false });
    expect(orderFindFirst).toHaveBeenCalledWith({ where: { providerChargeId: 'sale_1' } });
    expect(reconcileMock).toHaveBeenCalledWith(expect.anything(), 'order-1');
  });

  it('does not call reconcile when no Order matches the sale id (unknown/dropped)', async () => {
    findUnique.mockResolvedValueOnce(null);
    orderFindFirst.mockResolvedValueOnce(null);

    const { POST } = await import('./route');
    const res = await POST(
      req('test-secret', { event: 'settled.sale', data: { id: 'sale_unknown' } }),
    );

    expect(res.status).toBe(200);
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it('exports runtime=nodejs and dynamic=force-dynamic', async () => {
    const mod = (await import('./route')) as { runtime?: string; dynamic?: string };
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });
});
