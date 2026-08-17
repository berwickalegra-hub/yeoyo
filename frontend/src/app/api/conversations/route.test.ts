// A blocked contact's conversation must not surface in the inbox — messaging
// them is already refused server-side (conversations/[id]/messages/route.ts's
// isBlockedEitherWay check), so leaving the thread visible/clickable here was
// a dead end with no indication it was blocked (2026-08-17 audit finding).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Profile } from '@prisma/client';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

// prisma.message.groupBy's overloaded generic signature confuses
// vitest-mock-extended's typing — cast the mock itself rather than the
// resolved value (matches no existing precedent in this repo since no
// other route mocks groupBy; `as never` on the args here, not on data).
const groupByMock = prismaMock.message.groupBy as unknown as {
  mockResolvedValue: (v: unknown[]) => void;
};

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

function makeUser(userId: string) {
  return { id: userId, profile: { ...makeProfile({ userId }), photos: [] } };
}

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/conversations', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  groupByMock.mockResolvedValue([]);
  prismaMock.subscription.findMany.mockResolvedValue([] as never);
  prismaMock.blockedUser.findMany.mockResolvedValue([] as never);
});

describe('GET /api/conversations — block filtering', () => {
  it('Test 1: excludes a conversation whose other participant is blocked (either direction)', async () => {
    prismaMock.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-1',
        userAId: 'me-1',
        userBId: 'blocked-1',
        userA: makeUser('me-1'),
        userB: makeUser('blocked-1'),
        messages: [],
        mutedByUserA: false,
        mutedByUserB: false,
      },
    ] as never);
    prismaMock.blockedUser.findMany.mockResolvedValue([
      { blockerId: 'me-1', blockedId: 'blocked-1' },
    ] as never);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conversations).toEqual([]);
  });

  it('Test 2: keeps a conversation with a non-blocked participant', async () => {
    prismaMock.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-2',
        userAId: 'me-1',
        userBId: 'friend-1',
        userA: makeUser('me-1'),
        userB: makeUser('friend-1'),
        messages: [],
        mutedByUserA: false,
        mutedByUserB: false,
      },
    ] as never);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0].id).toBe('conv-2');
  });

  it('Test 3: excludes a conversation when I am the one who blocked the other side', async () => {
    prismaMock.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-3',
        userAId: 'me-1',
        userBId: 'blocked-2',
        userA: makeUser('me-1'),
        userB: makeUser('blocked-2'),
        messages: [],
        mutedByUserA: false,
        mutedByUserB: false,
      },
    ] as never);
    prismaMock.blockedUser.findMany.mockResolvedValue([
      { blockerId: 'blocked-2', blockedId: 'me-1' },
    ] as never);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(body.conversations).toEqual([]);
  });
});
