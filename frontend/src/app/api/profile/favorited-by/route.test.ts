// GET /api/profile/favorited-by — focused on the 2026-08-25 permanent-
// reveal computation: a favorite row is `revealed` once its createdAt is
// at/before Profile.favoritedByUnlockedAt, and unrevealedCount only counts
// rows created strictly after that timestamp.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { Profile } from '@prisma/client';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'me-1', email: 'me@example.com' } };

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/profile/favorited-by');
}

function fakeProfile(userId: string): Profile {
  return {
    userId,
    firstName: 'Aïcha',
    dateOfBirth: new Date('1998-01-01'),
    job: null,
    country: 'CD',
    city: 'Kinshasa',
    commune: null,
    intent: 'SERIEUX',
    religion: null,
    childrenCount: null,
    maritalStatus: null,
    verifiedAt: null,
    bio: null,
    wantsChildren: null,
    relocateOpen: null,
    qualities: null,
    flaws: null,
    dealbreakers: null,
    interests: [],
  } as unknown as Profile;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.blockedUser.findMany.mockResolvedValue([]);
});

describe('GET /api/profile/favorited-by — permanent reveal', () => {
  it('marks a favorite revealed only when createdAt <= favoritedByUnlockedAt', async () => {
    const unlockedAt = new Date('2026-08-20T00:00:00Z');
    prismaMock.profile.findUnique.mockResolvedValueOnce({
      favoritedByUnlockedAt: unlockedAt,
    } as never);
    prismaMock.favorite.findMany.mockResolvedValueOnce([
      { userId: 'old-1', createdAt: new Date('2026-08-19T00:00:00Z') },
      { userId: 'new-1', createdAt: new Date('2026-08-21T00:00:00Z') },
    ] as never);
    prismaMock.profile.findMany.mockResolvedValueOnce([
      { ...fakeProfile('old-1'), photos: [] },
      { ...fakeProfile('new-1'), photos: [] },
    ] as never);
    prismaMock.favorite.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      preview: { userId: string; revealed: boolean }[];
      total: number;
      unrevealedCount: number;
    };
    const byId = new Map(body.preview.map((p) => [p.userId, p.revealed]));
    expect(byId.get('old-1')).toBe(true);
    expect(byId.get('new-1')).toBe(false);
    expect(body.total).toBe(2);
    expect(body.unrevealedCount).toBe(1);
  });

  it('treats every row as unrevealed when the profile has never unlocked (favoritedByUnlockedAt = null)', async () => {
    prismaMock.profile.findUnique.mockResolvedValueOnce({ favoritedByUnlockedAt: null } as never);
    prismaMock.favorite.findMany.mockResolvedValueOnce([
      { userId: 'a-1', createdAt: new Date('2026-08-01T00:00:00Z') },
    ] as never);
    prismaMock.profile.findMany.mockResolvedValueOnce([
      { ...fakeProfile('a-1'), photos: [] },
    ] as never);
    prismaMock.favorite.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const res = await GET(makeGet());
    const body = (await res.json()) as {
      preview: { revealed: boolean }[];
      unrevealedCount: number;
    };
    expect(body.preview[0]?.revealed).toBe(false);
    expect(body.unrevealedCount).toBe(1);
  });

  it('propagates 401 from requireAuth without any DB hit', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(prismaMock.favorite.findMany).not.toHaveBeenCalled();
  });
});
