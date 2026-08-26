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

  it('POST inserts a 300 FCFA VERIFICATION_BONUS for a referred HOMME on approve', async () => {
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
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce(null);
    prismaMock.affiliateEarning.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost('p_bonus_h', { action: 'APPROVE' }), ctxWith('p_bonus_h'));
    expect(res.status).toBe(200);
    expect(prismaMock.affiliateEarning.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          affiliateId: 'aff_1',
          referredUserId: 'user_1',
          type: 'VERIFICATION_BONUS',
          amount: 300,
        }),
      }),
    );
  });

  it('POST inserts a 1500 FCFA VERIFICATION_BONUS for a referred FEMME on approve', async () => {
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
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce(null);
    prismaMock.affiliateEarning.create.mockResolvedValueOnce({} as never);

    await POST(makePost('p_bonus_f', { action: 'APPROVE' }), ctxWith('p_bonus_f'));
    expect(prismaMock.affiliateEarning.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 1500 }) }),
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
    expect(prismaMock.affiliateEarning.create).not.toHaveBeenCalled();
  });

  it('POST never inserts a bonus on REJECT even with a referring affiliate', async () => {
    const profile = seedProfile({ id: 'p_reject', referredByAffiliateId: 'aff_1' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'REJECTED',
    } as never);

    await POST(makePost('p_reject', { action: 'REJECT' }), ctxWith('p_reject'));
    expect(prismaMock.affiliateEarning.create).not.toHaveBeenCalled();
  });

  it('POST never inserts a second bonus for the same referredUserId (app-level check)', async () => {
    const profile = seedProfile({ id: 'p_dup', referredByAffiliateId: 'aff_1' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
    } as never);
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce({ id: 'already_exists' } as never);

    const res = await POST(makePost('p_dup', { action: 'APPROVE' }), ctxWith('p_dup'));
    expect(res.status).toBe(200);
    expect(prismaMock.affiliateEarning.create).not.toHaveBeenCalled();
  });

  it('POST swallows a P2002 race from the partial unique index without failing the profile update', async () => {
    const profile = seedProfile({ id: 'p_race', referredByAffiliateId: 'aff_1' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
    } as never);
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce(null);
    prismaMock.affiliateEarning.create.mockRejectedValueOnce({ code: 'P2002' });

    const res = await POST(makePost('p_race', { action: 'APPROVE' }), ctxWith('p_race'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: { verificationStatus: string } };
    expect(body.profile.verificationStatus).toBe('VERIFIED');
  });
});
