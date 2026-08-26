import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/server/middleware')>('@/lib/server/middleware');
  return { ...actual, requireAuth: vi.fn() };
});

import { requireAuth } from '@/lib/server/middleware';
import { requireAffiliate } from './require-affiliate';
import { seedAffiliate, seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAuth = vi.mocked(requireAuth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireAffiliate', () => {
  it('propagates a 401 from requireAuth unchanged', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await requireAffiliate();
    expect(res).toBeInstanceOf(NextResponse);
    expect((res as NextResponse).status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 AFFILIATE_REQUIRED for a non-affiliate role (e.g. SUPERADMIN)', async () => {
    const admin = seedAdmin({ role: 'SUPERADMIN' as never });
    mockRequireAuth.mockResolvedValueOnce({ user: { sub: admin.id, email: admin.email } });
    prismaMock.user.findUnique.mockResolvedValueOnce(admin as never);
    const res = await requireAffiliate();
    expect(res).toBeInstanceOf(NextResponse);
    const body = await (res as NextResponse).json();
    expect((res as NextResponse).status).toBe(403);
    expect(body.error).toBe('AFFILIATE_REQUIRED');
  });

  it('returns 403 for a plain USER', async () => {
    mockRequireAuth.mockResolvedValueOnce({ user: { sub: 'u1', email: 'u1@test.local' } });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'u1@test.local',
      role: 'USER',
      affiliateCode: null,
    } as never);
    const res = await requireAffiliate();
    expect((res as NextResponse).status).toBe(403);
  });

  it('resolves an AffiliateContext for role=AFFILIATE with a code', async () => {
    const affiliate = seedAffiliate();
    mockRequireAuth.mockResolvedValueOnce({
      user: { sub: affiliate.id, email: affiliate.email },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(affiliate as never);
    const ctx = await requireAffiliate();
    expect(ctx).toEqual({
      user: { sub: affiliate.id, email: affiliate.email },
      affiliate: {
        id: affiliate.id,
        email: affiliate.email,
        affiliateCode: affiliate.affiliateCode,
      },
    });
  });
});
