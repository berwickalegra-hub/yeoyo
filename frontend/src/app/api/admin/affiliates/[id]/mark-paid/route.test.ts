import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
});
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { POST } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

function makePost(id: string): NextRequest {
  return new NextRequest(`http://test/api/admin/affiliates/${id}/mark-paid`, { method: 'POST' });
}
function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  const superadmin = seedSuperadmin();
  mockRequireSuperadmin.mockResolvedValue({
    user: { sub: superadmin.id, email: superadmin.email },
    admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
  });
  mockRateLimit.mockResolvedValue(null);
});

describe('POST /api/admin/affiliates/[id]/mark-paid', () => {
  it('marks every currently-unpaid row paid and logs the total', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'aff_1',
      role: 'AFFILIATE',
    } as never);
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.affiliateEarning.updateMany.mockResolvedValueOnce({ count: 2 });
    prismaMock.affiliateEarning.aggregate.mockResolvedValueOnce({
      _sum: { amount: 1800 },
    } as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost('aff_1'), ctxWith('aff_1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { amount: number; count: number };
    expect(body.amount).toBe(1800);
    expect(body.count).toBe(2);
    expect(prismaMock.affiliateEarning.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { affiliateId: 'aff_1', paidAt: null },
        data: { paidAt: expect.any(Date) },
      }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'affiliate.mark_paid' }),
      }),
    );
  });

  it('returns 404 for a non-affiliate user id', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1', role: 'USER' } as never);
    const res = await POST(makePost('u1'), ctxWith('u1'));
    expect(res.status).toBe(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('propagates 403 from requireSuperadmin', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost('aff_1'), ctxWith('aff_1'));
    expect(res.status).toBe(403);
  });
});
