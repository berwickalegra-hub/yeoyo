// GET /api/profile/visitors — focused on the 2026-08-25 permanent-reveal
// computation: a visitor row is `revealed` once their most recent visit is
// at/before Profile.visitorsUnlockedAt, and unrevealedCount is computed
// in-memory from the deduped visitor list.
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
  return new NextRequest('http://test/api/profile/visitors');
}

function fakeProfile(userId: string): Profile {
  return {
    userId,
    firstName: 'Moussa',
    dateOfBirth: new Date('1995-01-01'),
    job: null,
    country: 'CI',
    city: 'Abidjan',
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

describe('GET /api/profile/visitors — permanent reveal', () => {
  it('marks a visitor revealed only when their latest view <= visitorsUnlockedAt, and dedupes repeat visits', async () => {
    const unlockedAt = new Date('2026-08-20T00:00:00Z');
    prismaMock.profile.findUnique.mockResolvedValueOnce({
      visitorsUnlockedAt: unlockedAt,
    } as never);
    prismaMock.profileView.findMany.mockResolvedValueOnce([
      // most recent visit first per the route's orderBy
      { viewerId: 'new-1', createdAt: new Date('2026-08-22T00:00:00Z') },
      { viewerId: 'old-1', createdAt: new Date('2026-08-19T00:00:00Z') },
      { viewerId: 'old-1', createdAt: new Date('2026-08-10T00:00:00Z') }, // older dupe, ignored
    ] as never);
    prismaMock.profile.findMany.mockResolvedValueOnce([
      { ...fakeProfile('new-1'), photos: [] },
      { ...fakeProfile('old-1'), photos: [] },
    ] as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      visitors: { profile: { userId: string }; revealed: boolean }[];
      total: number;
      unrevealedCount: number;
    };
    expect(body.total).toBe(2);
    const byId = new Map(body.visitors.map((v) => [v.profile.userId, v.revealed]));
    expect(byId.get('old-1')).toBe(true);
    expect(byId.get('new-1')).toBe(false);
    expect(body.unrevealedCount).toBe(1);
  });

  it('treats every row as unrevealed when the profile has never unlocked (visitorsUnlockedAt = null)', async () => {
    prismaMock.profile.findUnique.mockResolvedValueOnce({ visitorsUnlockedAt: null } as never);
    prismaMock.profileView.findMany.mockResolvedValueOnce([
      { viewerId: 'a-1', createdAt: new Date('2026-08-01T00:00:00Z') },
    ] as never);
    prismaMock.profile.findMany.mockResolvedValueOnce([
      { ...fakeProfile('a-1'), photos: [] },
    ] as never);

    const res = await GET(makeGet());
    const body = (await res.json()) as {
      visitors: { revealed: boolean }[];
      unrevealedCount: number;
    };
    expect(body.visitors[0]?.revealed).toBe(false);
    expect(body.unrevealedCount).toBe(1);
  });

  it('propagates 401 from requireAuth without any DB hit', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(prismaMock.profileView.findMany).not.toHaveBeenCalled();
  });
});
