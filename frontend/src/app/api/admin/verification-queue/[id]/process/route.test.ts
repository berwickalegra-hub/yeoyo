// POST /api/admin/verification-queue/[id]/process — approve/reject a
// pending profile. Gated at MODERATOR (not just ADMIN) per the Task 3
// access widening.
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
import { POST } from './route';
import { seedAdmin, seedModerator } from '@/test-utils/admin-fixtures';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockLogAdminAction = vi.mocked(logAdminAction);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makePost(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/admin/verification-queue/${id}/process`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function seedProfile(
  overrides: Partial<{
    id: string;
    userId: string;
    verificationStatus: string;
    gender: string;
    referredByAffiliateId: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? 'profile_1',
    userId: overrides.userId ?? 'user_1',
    verificationStatus: overrides.verificationStatus ?? 'PENDING',
    verifiedAt: null,
    gender: overrides.gender ?? 'HOMME',
    user: {
      id: overrides.userId ?? 'user_1',
      referredByAffiliateId: overrides.referredByAffiliateId ?? null,
    },
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

describe('/api/admin/verification-queue/[id]/process', () => {
  it('POST approves a pending profile and logs the admin action', async () => {
    const profile = seedProfile({ id: 'p1' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
    } as never);

    const res = await POST(makePost('p1', { action: 'APPROVE' }), ctxWith('p1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: { verificationStatus: string } };
    expect(body.profile.verificationStatus).toBe('VERIFIED');
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'profile.verify', targetType: 'Profile', targetId: 'p1' }),
    );
  });

  it('POST rejects a pending profile', async () => {
    const profile = seedProfile({ id: 'p2' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'REJECTED',
    } as never);

    const res = await POST(makePost('p2', { action: 'REJECT' }), ctxWith('p2'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: { verificationStatus: string } };
    expect(body.profile.verificationStatus).toBe('REJECTED');
  });

  it('POST returns 404 PROFILE_NOT_FOUND for a missing profile', async () => {
    prismaMock.profile.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost('missing', { action: 'APPROVE' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('PROFILE_NOT_FOUND');
  });

  it('POST is idempotent on an already-processed profile (no AdminAction write)', async () => {
    const profile = seedProfile({ id: 'p3', verificationStatus: 'VERIFIED' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    const res = await POST(makePost('p3', { action: 'APPROVE' }), ctxWith('p3'));
    expect(res.status).toBe(200);
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('POST returns 400 VALIDATION_FAILED for an invalid action', async () => {
    const res = await POST(makePost('p1', { action: 'BOGUS' }), ctxWith('p1'));
    expect(res.status).toBe(400);
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });

  it('POST allows MODERATOR (not just ADMIN)', async () => {
    const moderator = seedModerator();
    mockRequireAdmin.mockResolvedValueOnce({
      user: { sub: moderator.id, email: moderator.email },
      admin: { id: moderator.id, email: moderator.email, role: 'MODERATOR' as const },
    });
    const profile = seedProfile({ id: 'p4' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
    } as never);
    const res = await POST(makePost('p4', { action: 'APPROVE' }), ctxWith('p4'));
    expect(res.status).toBe(200);
  });

  it('POST propagates CSRF failure before touching Prisma', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_FAILED' }, { status: 403 }),
    );
    const res = await POST(makePost('p1', { action: 'APPROVE' }), ctxWith('p1'));
    expect(res.status).toBe(403);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });

  it('POST propagates 403 from requireAdmin (below MODERATOR)', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost('p1', { action: 'APPROVE' }), ctxWith('p1'));
    expect(res.status).toBe(403);
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });

  it('POST inserts a 30 FCFA VERIFICATION_BONUS for a referred HOMME on approve', async () => {
    const profile = seedProfile({
      id: 'p_bonus_h',
      gender: 'HOMME',
      referredByAffiliateId: 'aff_1',
    });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
    } as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'aff_1', role: 'AFFILIATE' } as never);
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce(null);
    prismaMock.affiliateEarning.createMany.mockResolvedValueOnce({ count: 1 } as never);

    const res = await POST(makePost('p_bonus_h', { action: 'APPROVE' }), ctxWith('p_bonus_h'));
    expect(res.status).toBe(200);
    expect(prismaMock.affiliateEarning.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            affiliateId: 'aff_1',
            referredUserId: 'user_1',
            type: 'VERIFICATION_BONUS',
            amount: 30,
          }),
        ],
        skipDuplicates: true,
      }),
    );
  });

  it('POST inserts a 90 FCFA VERIFICATION_BONUS for a referred FEMME on approve', async () => {
    const profile = seedProfile({
      id: 'p_bonus_f',
      gender: 'FEMME',
      referredByAffiliateId: 'aff_1',
    });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
    } as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'aff_1', role: 'AFFILIATE' } as never);
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce(null);
    prismaMock.affiliateEarning.createMany.mockResolvedValueOnce({ count: 1 } as never);

    await POST(makePost('p_bonus_f', { action: 'APPROVE' }), ctxWith('p_bonus_f'));
    expect(prismaMock.affiliateEarning.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ amount: 90 })],
        skipDuplicates: true,
      }),
    );
  });

  it('POST never inserts a bonus when the profile has no referring affiliate', async () => {
    const profile = seedProfile({ id: 'p_no_ref', referredByAffiliateId: null });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
    } as never);

    await POST(makePost('p_no_ref', { action: 'APPROVE' }), ctxWith('p_no_ref'));
    expect(prismaMock.affiliateEarning.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.affiliateEarning.createMany).not.toHaveBeenCalled();
  });

  it('POST never inserts a bonus on REJECT even with a referring affiliate', async () => {
    const profile = seedProfile({ id: 'p_reject', referredByAffiliateId: 'aff_1' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'REJECTED',
    } as never);

    await POST(makePost('p_reject', { action: 'REJECT' }), ctxWith('p_reject'));
    expect(prismaMock.affiliateEarning.createMany).not.toHaveBeenCalled();
  });

  it('POST never inserts a second bonus for the same referredUserId (app-level check)', async () => {
    const profile = seedProfile({ id: 'p_dup', referredByAffiliateId: 'aff_1' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
    } as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'aff_1', role: 'AFFILIATE' } as never);
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce({ id: 'already_exists' } as never);

    const res = await POST(makePost('p_dup', { action: 'APPROVE' }), ctxWith('p_dup'));
    expect(res.status).toBe(200);
    expect(prismaMock.affiliateEarning.createMany).not.toHaveBeenCalled();
  });

  it('POST uses createMany+skipDuplicates so a concurrent duplicate bonus never aborts the transaction', async () => {
    // On Postgres, a unique-constraint violation inside an interactive
    // Prisma transaction aborts the WHOLE transaction (25P02) — a JS
    // try/catch around a throwing `.create()` cannot undo that (no
    // savepoints between statements), so the next statement
    // (logAdminAction) would itself throw and roll back the profile's
    // legitimate verification too. `createMany({ skipDuplicates: true })`
    // compiles to `INSERT ... ON CONFLICT DO NOTHING`, so a concurrent
    // request having already inserted the row between our findFirst and
    // this insert just resolves with `count: 0` instead of throwing.
    const profile = seedProfile({ id: 'p_race', referredByAffiliateId: 'aff_1' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
    } as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'aff_1', role: 'AFFILIATE' } as never);
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce(null);
    prismaMock.affiliateEarning.createMany.mockResolvedValueOnce({ count: 0 } as never);

    const res = await POST(makePost('p_race', { action: 'APPROVE' }), ctxWith('p_race'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: { verificationStatus: string } };
    expect(body.profile.verificationStatus).toBe('VERIFIED');
    expect(prismaMock.affiliateEarning.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  describe('peer referral points (non-AFFILIATE referrer)', () => {
    it('awards 10 points and does not convert when under the 100-point threshold', async () => {
      const profile = seedProfile({ id: 'p_points_1', referredByAffiliateId: 'ref_1' });
      prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
      prismaMock.profile.update.mockResolvedValueOnce({
        ...profile,
        verificationStatus: 'VERIFIED',
      } as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'ref_1',
        role: 'USER',
        status: 'ACTIVE',
      } as never);
      prismaMock.referralBonus.count.mockResolvedValueOnce(3);
      prismaMock.referralBonus.createMany.mockResolvedValueOnce({ count: 1 } as never);
      prismaMock.user.update.mockResolvedValueOnce({ referralPoints: 30 } as never);

      const res = await POST(makePost('p_points_1', { action: 'APPROVE' }), ctxWith('p_points_1'));
      expect(res.status).toBe(200);
      expect(prismaMock.referralBonus.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [{ referrerId: 'ref_1', referredUserId: 'user_1', points: 10 }],
          skipDuplicates: true,
        }),
      );
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'ref_1' },
        data: { referralPoints: { increment: 10 } },
        select: { referralPoints: true },
      });
      // Under 100 points (30) — no conversion, so no second user.update and
      // no credit transaction.
      expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.creditTransaction.create).not.toHaveBeenCalled();
    });

    it('auto-converts to credits when the 100-point threshold is crossed', async () => {
      const profile = seedProfile({ id: 'p_points_2', referredByAffiliateId: 'ref_2' });
      prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
      prismaMock.profile.update.mockResolvedValueOnce({
        ...profile,
        verificationStatus: 'VERIFIED',
      } as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'ref_2',
        role: 'USER',
        status: 'ACTIVE',
      } as never);
      prismaMock.referralBonus.count.mockResolvedValueOnce(0);
      prismaMock.referralBonus.createMany.mockResolvedValueOnce({ count: 1 } as never);
      // Balance was 95, +10 crosses to 105 — 1 credit granted, remainder 5.
      prismaMock.user.update
        .mockResolvedValueOnce({ referralPoints: 105 } as never) // increment
        .mockResolvedValueOnce({ referralPoints: 5 } as never) // remainder write
        .mockResolvedValueOnce({ creditBalance: 6 } as never); // grantCredits' own update
      prismaMock.creditTransaction.create.mockResolvedValueOnce({} as never);

      const res = await POST(makePost('p_points_2', { action: 'APPROVE' }), ctxWith('p_points_2'));
      expect(res.status).toBe(200);
      expect(prismaMock.user.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'ref_2' },
        data: { referralPoints: 5 },
      });
      expect(prismaMock.creditTransaction.create).toHaveBeenCalledWith({
        data: {
          userId: 'ref_2',
          type: 'REFERRAL_CONVERSION',
          amount: 1,
          action: 'referral_points_conversion',
          relatedOrderId: null,
        },
      });
    });

    it('awards nothing once the referrer already has 10 bonuses this month', async () => {
      const profile = seedProfile({ id: 'p_points_3', referredByAffiliateId: 'ref_3' });
      prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
      prismaMock.profile.update.mockResolvedValueOnce({
        ...profile,
        verificationStatus: 'VERIFIED',
      } as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'ref_3',
        role: 'USER',
        status: 'ACTIVE',
      } as never);
      prismaMock.referralBonus.count.mockResolvedValueOnce(10);

      const res = await POST(makePost('p_points_3', { action: 'APPROVE' }), ctxWith('p_points_3'));
      expect(res.status).toBe(200);
      expect(prismaMock.referralBonus.createMany).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('never touches the points path for an AFFILIATE-role referrer (mutual exclusivity)', async () => {
      const profile = seedProfile({ id: 'p_points_4', referredByAffiliateId: 'aff_1' });
      prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
      prismaMock.profile.update.mockResolvedValueOnce({
        ...profile,
        verificationStatus: 'VERIFIED',
      } as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'aff_1', role: 'AFFILIATE' } as never);
      prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce(null);
      prismaMock.affiliateEarning.createMany.mockResolvedValueOnce({ count: 1 } as never);

      await POST(makePost('p_points_4', { action: 'APPROVE' }), ctxWith('p_points_4'));
      expect(prismaMock.referralBonus.count).not.toHaveBeenCalled();
      expect(prismaMock.referralBonus.createMany).not.toHaveBeenCalled();
    });

    it('awards nothing to a SUSPENDED referrer', async () => {
      const profile = seedProfile({ id: 'p_points_5', referredByAffiliateId: 'ref_5' });
      prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
      prismaMock.profile.update.mockResolvedValueOnce({
        ...profile,
        verificationStatus: 'VERIFIED',
      } as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'ref_5',
        role: 'USER',
        status: 'SUSPENDED',
      } as never);

      const res = await POST(makePost('p_points_5', { action: 'APPROVE' }), ctxWith('p_points_5'));
      expect(res.status).toBe(200);
      expect(prismaMock.referralBonus.count).not.toHaveBeenCalled();
      expect(prismaMock.referralBonus.createMany).not.toHaveBeenCalled();
    });

    it('awards nothing on a self-referral (referrer id equals the referred user id)', async () => {
      const profile = seedProfile({
        id: 'p_points_6',
        userId: 'user_1',
        referredByAffiliateId: 'user_1',
      });
      prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
      prismaMock.profile.update.mockResolvedValueOnce({
        ...profile,
        verificationStatus: 'VERIFIED',
      } as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'user_1',
        role: 'USER',
        status: 'ACTIVE',
      } as never);

      const res = await POST(makePost('p_points_6', { action: 'APPROVE' }), ctxWith('p_points_6'));
      expect(res.status).toBe(200);
      expect(prismaMock.referralBonus.count).not.toHaveBeenCalled();
      expect(prismaMock.referralBonus.createMany).not.toHaveBeenCalled();
    });
  });
});
