// Covers the `liked` field added to each returned profile card (2026-08-12)
// — grid/deck cards need to know whether the caller already liked a profile
// so the heart can render filled on load, not just right after a click.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Profile } from '@prisma/client';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'me-1', email: 'me@example.com' } };

function makeProfile(overrides: Partial<Profile> & { userId: string }): Profile {
  return {
    id: `profile_${overrides.userId}`,
    gender: 'FEMME',
    firstName: 'Awa',
    lastName: null,
    dateOfBirth: new Date('1995-01-01'),
    city: 'Kinshasa',
    commune: null,
    religion: null,
    maritalStatus: null,
    childrenCount: null,
    wantsChildren: null,
    relocateOpen: null,
    qualities: null,
    flaws: null,
    dealbreakers: null,
    interestedIn: null,
    intent: 'LONG_TERME',
    job: null,
    bio: null,
    interests: [],
    languages: [],
    visibilityPublic: true,
    onlineStatusVisible: true,
    searchPrefs: null,
    verifiedAt: null,
    verificationStatus: 'PENDING',
    onboardingCompletedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Profile;
}

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/profiles/explorer', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.profile.findUnique.mockResolvedValue(makeProfile({ userId: 'me-1', gender: 'HOMME' }));
  prismaMock.blockedUser.findMany.mockResolvedValue([]);
});

describe('GET /api/profiles/explorer — liked field', () => {
  it('Test 1: marks a profile as liked when a Like row exists for the caller', async () => {
    const candidateA = { ...makeProfile({ userId: 'user-a' }), photos: [] };
    const candidateB = { ...makeProfile({ userId: 'user-b' }), photos: [] };
    prismaMock.profile.count.mockResolvedValue(2 as never);
    prismaMock.profile.findMany.mockResolvedValue([candidateA, candidateB] as never);
    prismaMock.like.findMany.mockResolvedValue([{ likedId: 'user-a' }] as never);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profiles.find((p: { userId: string }) => p.userId === 'user-a').liked).toBe(true);
    expect(body.profiles.find((p: { userId: string }) => p.userId === 'user-b').liked).toBe(false);
  });

  it('Test 2: skips the Like lookup when the page has no profiles', async () => {
    prismaMock.profile.count.mockResolvedValue(0 as never);
    prismaMock.profile.findMany.mockResolvedValue([] as never);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profiles).toEqual([]);
    expect(prismaMock.like.findMany).not.toHaveBeenCalled();
  });

  it('Test 3: scopes the Like lookup to the caller as likerId', async () => {
    const candidateA = { ...makeProfile({ userId: 'user-a' }), photos: [] };
    prismaMock.profile.count.mockResolvedValue(1 as never);
    prismaMock.profile.findMany.mockResolvedValue([candidateA] as never);
    prismaMock.like.findMany.mockResolvedValue([] as never);

    await GET(makeGet());

    const args = prismaMock.like.findMany.mock.calls[0]?.[0];
    expect(args?.where?.likerId).toBe('me-1');
  });
});
