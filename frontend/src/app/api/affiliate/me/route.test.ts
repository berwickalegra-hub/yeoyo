import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware/require-affiliate', () => ({ requireAffiliate: vi.fn() }));

import { requireAffiliate } from '@/lib/server/middleware/require-affiliate';
import { GET } from './route';

const mockRequireAffiliate = vi.mocked(requireAffiliate);

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/affiliate/me', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAffiliate.mockResolvedValue({
    user: { sub: 'aff_1', email: 'aff@test.local' },
    affiliate: { id: 'aff_1', email: 'aff@test.local', affiliateCode: 'AFF23456' },
  });
});

describe('GET /api/affiliate/me', () => {
  it('aggregates counters, earnings breakdown, and referred-user list', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ name: 'Marie K.' } as never); // me (own name)
    prismaMock.user.count.mockResolvedValueOnce(3); // totalSignups
    prismaMock.profile.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2); // men, women verified
    prismaMock.affiliateEarning.findMany.mockResolvedValueOnce([
      {
        amount: 300,
        type: 'VERIFICATION_BONUS',
        paidAt: null,
        referredUserId: 'u1',
        createdAt: new Date(),
      },
      {
        amount: 1500,
        type: 'VERIFICATION_BONUS',
        paidAt: new Date('2026-08-15T00:00:00.000Z'),
        referredUserId: 'u2',
        createdAt: new Date(),
      },
      {
        amount: 12750,
        type: 'CREDIT_COMMISSION',
        paidAt: null,
        referredUserId: 'u1',
        createdAt: new Date(),
      },
    ] as never);
    prismaMock.user.findMany.mockResolvedValueOnce([
      {
        id: 'u1',
        createdAt: new Date(),
        profile: { firstName: 'Jean', verificationStatus: 'VERIFIED' },
      },
      {
        id: 'u2',
        createdAt: new Date(),
        profile: { firstName: 'Awa', verificationStatus: 'VERIFIED' },
      },
    ] as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.affiliateCode).toBe('AFF23456');
    expect(body.email).toBe('aff@test.local');
    expect(body.name).toBe('Marie K.');
    expect(body.referralUrl).toContain('promo=AFF23456');
    expect(body.counters).toEqual({ totalSignups: 3, verifiedMen: 1, verifiedWomen: 2 });
    expect(body.earnings.total).toBe(14550);
    expect(body.earnings.pending).toBe(13050);
    expect(body.earnings.paid).toBe(1500);
    expect(body.referredUsers).toHaveLength(2);
    const jean = body.referredUsers.find((u: { firstName: string }) => u.firstName === 'Jean');
    expect(jean.totalEarned).toBe(13050);

    // 6-month history: always exactly 6 buckets, current month last. Every
    // mocked earning and both referred users carry `createdAt: new Date()`,
    // so they all land in the current-month bucket.
    expect(body.monthly).toHaveLength(6);
    const currentKey = new Date().toISOString().slice(0, 7);
    expect(body.monthly[5].month).toBe(currentKey);
    expect(body.monthly[5].earned).toBe(14550);
    expect(body.monthly[5].signups).toBe(2);
  });

  it('propagates 403 from requireAffiliate', async () => {
    mockRequireAffiliate.mockResolvedValueOnce(
      NextResponse.json({ error: 'AFFILIATE_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });
});
