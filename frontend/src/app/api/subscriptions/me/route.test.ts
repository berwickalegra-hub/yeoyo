// GET /api/subscriptions/me — free-tier passthrough + the admin-always-
// Premium self-heal (2026-08-17).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/subscriptions/me', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.profile.findUnique.mockResolvedValue(null);
});

describe('GET /api/subscriptions/me — free-tier USER', () => {
  it('returns { subscription: null } for a USER with no subscription row', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'USER' } as never);
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);

    const res = await GET(makeGet());
    const body = (await res.json()) as { subscription: unknown };
    expect(body.subscription).toBeNull();
    expect(prismaMock.subscription.create).not.toHaveBeenCalled();
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it('returns an existing PENDING subscription untouched for a USER (no self-heal)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'USER' } as never);
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_1',
      planId: '1m',
      status: 'PENDING',
      orderId: 'order_1',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    } as never);

    const res = await GET(makeGet());
    const body = (await res.json()) as { subscription: { status: string } };
    expect(body.subscription.status).toBe('PENDING');
    expect(prismaMock.subscription.create).not.toHaveBeenCalled();
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/subscriptions/me — admin-always-Premium self-heal', () => {
  it('ADMIN with no subscription row gets one created, tagged admin-grant', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'ADMIN' } as never);
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    prismaMock.subscription.create.mockResolvedValueOnce({
      id: 'sub_new',
      planId: '6m',
      status: 'ACTIVE',
      provider: 'admin-grant',
      orderId: null,
      currentPeriodEnd: new Date('2126-01-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
    } as never);

    const res = await GET(makeGet());
    const body = (await res.json()) as { subscription: { status: string; planName: string } };
    expect(body.subscription.status).toBe('ACTIVE');
    const createArgs = prismaMock.subscription.create.mock.calls[0]?.[0];
    expect(createArgs?.data).toEqual(
      expect.objectContaining({ userId: 'user-1', status: 'ACTIVE', provider: 'admin-grant' }),
    );
  });

  it('ADMIN with a non-ACTIVE (e.g. PENDING) row gets that row upgraded to ACTIVE via update, not a new row', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'ADMIN' } as never);
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_pending',
      planId: '1m',
      status: 'PENDING',
      provider: 'stub',
      orderId: 'order_1',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    } as never);
    prismaMock.subscription.update.mockResolvedValueOnce({
      id: 'sub_pending',
      planId: '6m',
      status: 'ACTIVE',
      provider: 'admin-grant',
      orderId: 'order_1',
      currentPeriodEnd: new Date('2126-01-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
    } as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    expect(prismaMock.subscription.create).not.toHaveBeenCalled();
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub_pending' },
        data: expect.objectContaining({ status: 'ACTIVE', provider: 'admin-grant' }),
      }),
    );
  });

  it('SUPERADMIN also self-heals to Premium', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'SUPERADMIN' } as never);
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    prismaMock.subscription.create.mockResolvedValueOnce({
      id: 'sub_new',
      planId: '6m',
      status: 'ACTIVE',
      provider: 'admin-grant',
      orderId: null,
      currentPeriodEnd: new Date('2126-01-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
    } as never);

    const res = await GET(makeGet());
    const body = (await res.json()) as { subscription: { status: string } };
    expect(body.subscription.status).toBe('ACTIVE');
  });

  it('ADMIN already ACTIVE via a real subscription is left untouched (no overwrite)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'ADMIN' } as never);
    prismaMock.subscription.findFirst.mockResolvedValueOnce({
      id: 'sub_real',
      planId: '3m',
      status: 'ACTIVE',
      provider: 'chariow',
      orderId: 'order_real',
      currentPeriodEnd: new Date('2026-11-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
    } as never);

    const res = await GET(makeGet());
    const body = (await res.json()) as { subscription: { status: string; id: string } };
    expect(body.subscription.id).toBe('sub_real');
    expect(prismaMock.subscription.create).not.toHaveBeenCalled();
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it('propagates 401 from requireAuth without any DB hit', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
