// GET /api/admin/verification-queue — the "Vérification IA" queue listing.
// Gated at MODERATOR (not just ADMIN) per the Task 3 access widening —
// moderators triage this queue day-to-day; ADMIN/SUPERADMIN still pass
// through the same `requireAdmin(min)` rank check.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';
import { seedAdmin, seedModerator } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function seedPendingProfile(overrides: Partial<{ id: string; onboardingCompletedAt: Date }> = {}) {
  return {
    id: overrides.id ?? 'profile_1',
    userId: 'user_1',
    firstName: 'Awa',
    dateOfBirth: new Date('2000-01-01T00:00:00.000Z'),
    verificationStatus: 'PENDING',
    onboardingCompletedAt: overrides.onboardingCompletedAt ?? new Date('2026-05-01T00:00:00.000Z'),
    photos: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('/api/admin/verification-queue — list', () => {
  it('GET returns pending profiles oldest-onboarded-first', async () => {
    const p1 = seedPendingProfile({ id: 'p1' });
    prismaMock.profile.findMany.mockResolvedValueOnce([p1] as never);
    prismaMock.profile.count.mockResolvedValueOnce(1 as never);

    const res = await GET(makeGet('http://test/api/admin/verification-queue'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }>; total: number };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe('p1');
    expect(body.total).toBe(1);

    const args = prismaMock.profile.findMany.mock.calls[0]?.[0];
    expect(args?.where).toEqual({
      verificationStatus: 'PENDING',
      onboardingCompletedAt: { not: null },
    });
    expect(args?.orderBy).toEqual({ onboardingCompletedAt: 'asc' });
  });

  it('GET returns empty 200 (never 404) on no rows', async () => {
    prismaMock.profile.findMany.mockResolvedValueOnce([] as never);
    prismaMock.profile.count.mockResolvedValueOnce(0 as never);
    const res = await GET(makeGet('http://test/api/admin/verification-queue'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], total: 0 });
  });

  it('GET allows MODERATOR (not just ADMIN)', async () => {
    const moderator = seedModerator();
    mockRequireAdmin.mockResolvedValueOnce({
      user: { sub: moderator.id, email: moderator.email },
      admin: { id: moderator.id, email: moderator.email, role: 'MODERATOR' as const },
    });
    prismaMock.profile.findMany.mockResolvedValueOnce([] as never);
    prismaMock.profile.count.mockResolvedValueOnce(0 as never);
    const res = await GET(makeGet('http://test/api/admin/verification-queue'));
    expect(res.status).toBe(200);
  });

  it('GET rate limits admin per-userId — propagates 429', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet('http://test/api/admin/verification-queue'));
    expect(res.status).toBe(429);
    expect(prismaMock.profile.findMany).not.toHaveBeenCalled();
  });

  it('GET propagates 403 from requireAdmin (below MODERATOR)', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/verification-queue'));
    expect(res.status).toBe(403);
    expect(prismaMock.profile.findMany).not.toHaveBeenCalled();
  });
});
