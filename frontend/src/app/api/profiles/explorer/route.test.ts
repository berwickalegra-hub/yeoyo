// Covers Explorer's exclusion of already-liked profiles (2026-08-13) —
// a profile the caller already sent a like/request to must never appear
// in Explorer/Découvrir again: showing a toggleable heart on a pending
// request reads as "can I take this back from here", which now only lives
// on Demandes → Envoyées (DELETE /api/likes). `liked` on every returned
// card is therefore always false by construction.
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

function makeGet(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/profiles/explorer${qs}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.profile.findUnique.mockResolvedValue(makeProfile({ userId: 'me-1', gender: 'HOMME' }));
  prismaMock.blockedUser.findMany.mockResolvedValue([]);
  prismaMock.like.findMany.mockResolvedValue([] as never);
  prismaMock.favorite.findMany.mockResolvedValue([] as never);
});

describe('GET /api/profiles/explorer — already-liked exclusion', () => {
  it('Test 1: excludes already-liked userIds from the profile query', async () => {
    prismaMock.like.findMany.mockResolvedValue([{ likedId: 'user-a' }] as never);
    prismaMock.profile.count.mockResolvedValue(0 as never);
    prismaMock.profile.findMany.mockResolvedValue([] as never);

    await GET(makeGet());

    const args = prismaMock.profile.findMany.mock.calls[0]?.[0];
    const notIn = (args?.where?.userId as { notIn: string[] } | undefined)?.notIn ?? [];
    expect(notIn).toContain('user-a');
    expect(notIn).toContain('me-1');
  });

  it('Test 2: every returned profile has liked: false (already-liked ones never reach this point)', async () => {
    const candidateB = { ...makeProfile({ userId: 'user-b' }), photos: [] };
    prismaMock.profile.count.mockResolvedValue(1 as never);
    prismaMock.profile.findMany.mockResolvedValue([candidateB] as never);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profiles.find((p: { userId: string }) => p.userId === 'user-b').liked).toBe(false);
  });

  it('Test 3: scopes the Like lookup to the caller as likerId', async () => {
    prismaMock.profile.count.mockResolvedValue(0 as never);
    prismaMock.profile.findMany.mockResolvedValue([] as never);

    await GET(makeGet());

    const args = prismaMock.like.findMany.mock.calls[0]?.[0];
    expect(args?.where?.likerId).toBe('me-1');
  });
});

describe('GET /api/profiles/explorer — same-country default (2026-08-26 fix)', () => {
  it('when the caller has a country, the implicit default also matches legacy country: null profiles', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(
      makeProfile({ userId: 'me-1', gender: 'HOMME', country: 'CD' }),
    );
    prismaMock.profile.count.mockResolvedValue(0 as never);
    prismaMock.profile.findMany.mockResolvedValue([] as never);

    await GET(makeGet());

    const args = prismaMock.profile.findMany.mock.calls[0]?.[0];
    expect(args?.where?.OR).toEqual([{ country: 'CD' }, { country: null }]);
  });

  it('an explicit ?country= filter stays strict equality (no null fallback)', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(
      makeProfile({ userId: 'me-1', gender: 'HOMME', country: 'CD' }),
    );
    prismaMock.profile.count.mockResolvedValue(0 as never);
    prismaMock.profile.findMany.mockResolvedValue([] as never);

    await GET(makeGet('?country=SN'));

    const args = prismaMock.profile.findMany.mock.calls[0]?.[0];
    expect(args?.where?.country).toBe('SN');
    expect(args?.where?.OR).toBeUndefined();
  });

  it('when the caller has no country set, no country filter is applied at all', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(
      makeProfile({ userId: 'me-1', gender: 'HOMME' }),
    );
    prismaMock.profile.count.mockResolvedValue(0 as never);
    prismaMock.profile.findMany.mockResolvedValue([] as never);

    await GET(makeGet());

    const args = prismaMock.profile.findMany.mock.calls[0]?.[0];
    expect(args?.where?.country).toBeUndefined();
    expect(args?.where?.OR).toBeUndefined();
  });
});
