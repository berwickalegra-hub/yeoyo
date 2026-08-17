// PATCH /api/admin/users/[id]/premium — admin grant/revoke Premium.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn(),
}));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { PATCH } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockLogAdminAction = vi.mocked(logAdminAction);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makePatch(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/admin/users/${id}/premium`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function seedSubscription(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub_1',
    userId: 'u1',
    planId: '1m',
    status: 'ACTIVE',
    provider: 'stub',
    orderId: null,
    currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockLogAdminAction.mockResolvedValue(undefined as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(undefined);
  });
});

describe('PATCH /api/admin/users/[id]/premium', () => {
  it('grants Premium to a free user (no existing Subscription row) — creates one tagged admin-grant', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1' } as never);
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);
    prismaMock.subscription.create.mockResolvedValueOnce(
      seedSubscription({ provider: 'admin-grant', planId: '6m' }) as never,
    );

    const res = await PATCH(makePatch('u1', { status: 'ACTIVE' }), ctxWith('u1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { subscription: { status: string; provider: string } };
    expect(body.subscription).toEqual(
      expect.objectContaining({ status: 'ACTIVE', provider: 'admin-grant' }),
    );

    const createArgs = prismaMock.subscription.create.mock.calls[0]?.[0];
    expect(createArgs?.data).toEqual(
      expect.objectContaining({
        userId: 'u1',
        status: 'ACTIVE',
        provider: 'admin-grant',
        planId: '6m',
      }),
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'user.premium_grant', targetType: 'User', targetId: 'u1' }),
    );
  });

  it('grants Premium to a user with a lapsed/cancelled Subscription — updates the existing row', async () => {
    const existing = seedSubscription({ status: 'CANCELLED', provider: 'chariow' });
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1' } as never);
    prismaMock.subscription.findFirst.mockResolvedValueOnce(existing as never);
    prismaMock.subscription.update.mockResolvedValueOnce(
      seedSubscription({ status: 'ACTIVE', provider: 'admin-grant' }) as never,
    );

    const res = await PATCH(makePatch('u1', { status: 'ACTIVE' }), ctxWith('u1'));
    expect(res.status).toBe(200);
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: expect.objectContaining({ status: 'ACTIVE', provider: 'admin-grant' }),
      }),
    );
  });

  it('is idempotent when already ACTIVE — no write, no AdminAction', async () => {
    const existing = seedSubscription({ status: 'ACTIVE', provider: 'admin-grant' });
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1' } as never);
    prismaMock.subscription.findFirst.mockResolvedValueOnce(existing as never);

    const res = await PATCH(makePatch('u1', { status: 'ACTIVE' }), ctxWith('u1'));
    expect(res.status).toBe(200);
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(prismaMock.subscription.create).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('revokes an active Subscription — sets CANCELLED + cancelAtPeriodEnd', async () => {
    const existing = seedSubscription({ status: 'ACTIVE', provider: 'admin-grant' });
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1' } as never);
    prismaMock.subscription.findFirst.mockResolvedValueOnce(existing as never);
    prismaMock.subscription.update.mockResolvedValueOnce(
      seedSubscription({ status: 'CANCELLED', cancelAtPeriodEnd: true }) as never,
    );

    const res = await PATCH(makePatch('u1', { status: 'CANCELLED' }), ctxWith('u1'));
    expect(res.status).toBe(200);
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: { status: 'CANCELLED', cancelAtPeriodEnd: true },
      }),
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'user.premium_revoke',
        targetType: 'User',
        targetId: 'u1',
      }),
    );
  });

  it('revoking a user with no Subscription row is a no-op (nothing to cancel)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1' } as never);
    prismaMock.subscription.findFirst.mockResolvedValueOnce(null);

    const res = await PATCH(makePatch('u1', { status: 'CANCELLED' }), ctxWith('u1'));
    expect(res.status).toBe(200);
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('returns 404 USER_NOT_FOUND for a missing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    const res = await PATCH(makePatch('missing', { status: 'ACTIVE' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('USER_NOT_FOUND');
  });

  it('returns 400 VALIDATION_FAILED for an invalid status', async () => {
    const res = await PATCH(makePatch('u1', { status: 'BOGUS' }), ctxWith('u1'));
    expect(res.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('propagates CSRF failure before touching Prisma', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_FAILED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch('u1', { status: 'ACTIVE' }), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
  });

  it('propagates 403 from requireAdmin without DB hit', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch('u1', { status: 'ACTIVE' }), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
