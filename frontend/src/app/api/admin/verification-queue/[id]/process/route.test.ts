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

function seedProfile(overrides: Partial<{ id: string; verificationStatus: string }> = {}) {
  return {
    id: overrides.id ?? 'profile_1',
    userId: 'user_1',
    verificationStatus: overrides.verificationStatus ?? 'PENDING',
    verifiedAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockLogAdminAction.mockResolvedValue(undefined as never);
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
});
