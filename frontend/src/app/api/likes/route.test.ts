// POST/DELETE /api/likes — focused on the monthly contact-request quota
// (2026-08-17: the landing page advertised "5 demandes / mois" free, but
// nothing enforced it server-side until now; the bypass is staff-role only
// since 2026-08-25, see lib/server/contact-requests/quota.ts) plus the core
// happy-path/guard behaviour this route had no test coverage for.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/blocks', () => ({
  isBlockedEitherWay: vi.fn(),
}));
vi.mock('@/lib/server/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/push', () => ({
  sendPushToUser: vi.fn(),
}));
// Same mocking pattern as src/app/api/withdrawals/route.test.ts: spy on
// lockUserTx so tests can assert it was invoked as the first statement
// inside the transaction, without exercising the real
// pg_advisory_xact_lock SQL (that's lock.test.ts's job). vi.hoisted keeps
// lockSpy safe to reference from the (hoisted) vi.mock factory below
// regardless of its position relative to the other vi.mock calls in this
// file.
const { lockSpy } = vi.hoisted(() => ({ lockSpy: vi.fn() }));
vi.mock('@/lib/server/withdrawals/lock', () => ({
  lockUserTx: lockSpy,
}));

import { requireAuth } from '@/lib/server/middleware';
import { isBlockedEitherWay } from '@/lib/server/blocks';
import { sendPushToUser } from '@/lib/server/push';
import { POST, DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockIsBlocked = vi.mocked(isBlockedEitherWay);
const authedCtx = { user: { sub: 'me-1', email: 'me@example.com' } };

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/likes', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function makeDelete(body: unknown): NextRequest {
  return new NextRequest('http://test/api/likes', {
    method: 'DELETE',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  mockIsBlocked.mockResolvedValue(false);
  prismaMock.profile.findUnique.mockResolvedValue({ onboardingCompletedAt: new Date() } as never);
  prismaMock.notificationPreferences.findUnique.mockResolvedValue(null);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(undefined);
  });
  prismaMock.like.upsert.mockResolvedValue({ id: 'like-1' } as never);
  prismaMock.contactRequest.upsert.mockResolvedValue({
    id: 'cr-1',
    status: 'PENDING',
  } as never);
});

describe('POST /api/likes — monthly quota', () => {
  it('allows a new request for a free user under quota (< 5 sent this month)', async () => {
    prismaMock.contactRequest.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'USER' } as never);
    prismaMock.contactRequest.count.mockResolvedValueOnce(3);

    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(201);
    expect(prismaMock.contactRequest.upsert).toHaveBeenCalled();
  });

  it('blocks a NEW request once the free user has hit 5 this month', async () => {
    prismaMock.contactRequest.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'USER' } as never);
    prismaMock.contactRequest.count.mockResolvedValueOnce(5);

    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('CONTACT_REQUEST_QUOTA_EXCEEDED');
    expect(prismaMock.contactRequest.upsert).not.toHaveBeenCalled();
    expect(prismaMock.like.upsert).not.toHaveBeenCalled();
  });

  it('never blocks re-liking a target already requested, even at/over quota (idempotent path)', async () => {
    prismaMock.contactRequest.findUnique.mockResolvedValueOnce({ id: 'cr-existing' } as never);

    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(201);
    // Quota must never even be consulted for an existing request.
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.contactRequest.count).not.toHaveBeenCalled();
  });

  it('ADMIN/SUPERADMIN staff are never blocked regardless of how many sent this month', async () => {
    prismaMock.contactRequest.findUnique.mockResolvedValueOnce(null);
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'ADMIN' } as never);

    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(201);
    // Staff short-circuits before counting this month's requests at all.
    expect(prismaMock.contactRequest.count).not.toHaveBeenCalled();
  });
});

describe('POST /api/likes — core guards (pre-existing behaviour)', () => {
  it('rejects liking your own profile', async () => {
    const res = await POST(makePost({ targetUserId: 'me-1' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('CANNOT_LIKE_SELF');
  });

  it('returns 404 PROFILE_NOT_FOUND when the target has no completed profile', async () => {
    prismaMock.profile.findUnique.mockResolvedValueOnce(null);
    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(404);
  });

  it('returns 404 PROFILE_NOT_FOUND (not 403) when either side has blocked the other', async () => {
    mockIsBlocked.mockResolvedValueOnce(true);
    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(404);
    expect(prismaMock.contactRequest.findUnique).not.toHaveBeenCalled();
  });

  it('propagates 401 from requireAuth without any DB hit', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(401);
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/likes', () => {
  it('unliking cancels a still-PENDING request', async () => {
    prismaMock.like.delete.mockResolvedValueOnce({ id: 'like-1' } as never);
    prismaMock.contactRequest.updateMany.mockResolvedValueOnce({ count: 1 } as never);

    const res = await DELETE(makeDelete({ targetUserId: 'target-1' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { likeExisted: boolean; contactRequestCancelled: boolean };
    expect(body).toEqual({ likeExisted: true, contactRequestCancelled: true });
  });
});

describe('POST /api/likes — Message Flash + Conversation-on-accept-only', () => {
  it('a normal like (no flash) creates only Like+ContactRequest, no Conversation, conversationId null', async () => {
    prismaMock.contactRequest.findUnique
      .mockResolvedValueOnce(null) // existingRequest — new request (pre-tx)
      .mockResolvedValueOnce(null) // existingFresh — new request (in-tx, under the advisory lock)
      .mockResolvedValueOnce(null); // reverseRequest — no mutual match
    prismaMock.contactRequest.upsert.mockResolvedValueOnce({
      id: 'cr-1',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'PENDING',
      flashMessageBody: null,
      createdAt: new Date(),
    } as never);

    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { conversationId: string | null };
    expect(body.conversationId).toBeNull();
    expect(prismaMock.conversation.create).not.toHaveBeenCalled();
    // The one call is contactRequestQuotaStatus's own role check (isNewRequest
    // gates quota regardless of flash) — no flash → no ADDITIONAL role check,
    // no spend attempted.
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    // New contact request → web push to the target (prefs default opt-in).
    expect(vi.mocked(sendPushToUser)).toHaveBeenCalledWith(
      expect.anything(),
      'target-1',
      expect.objectContaining({ url: expect.stringContaining('/app/') }),
    );
  });

  it('does NOT push a new contact request when the target opted out of the CONTACT_REQUEST push channel', async () => {
    prismaMock.contactRequest.findUnique
      .mockResolvedValueOnce(null) // existingRequest — new request (pre-tx)
      .mockResolvedValueOnce(null) // existingFresh — new request (in-tx)
      .mockResolvedValueOnce(null); // reverseRequest — no mutual match
    prismaMock.contactRequest.upsert.mockResolvedValueOnce({
      id: 'cr-1',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'PENDING',
      flashMessageBody: null,
      createdAt: new Date(),
    } as never);
    prismaMock.notificationPreferences.findUnique.mockResolvedValueOnce({
      prefs: { CONTACT_REQUEST: { push: false } },
    } as never);

    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(201);
    expect(vi.mocked(sendPushToUser)).not.toHaveBeenCalled();
  });

  it('a flash like with sufficient credits charges 3 credits and stores flashMessageBody, still no Conversation', async () => {
    prismaMock.contactRequest.findUnique
      .mockResolvedValueOnce(null) // existingRequest — new request (pre-tx)
      .mockResolvedValueOnce(null) // existingFresh — new request (in-tx, under the advisory lock)
      .mockResolvedValueOnce(null); // reverseRequest — no mutual match
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: 'USER' } as never) // contactRequestQuotaStatus's own role check
      .mockResolvedValueOnce({ role: 'USER', profile: { gender: 'HOMME' } } as never); // gender/staff check before spend
    // spendCredits' own post-CAS balance fetch falls through to the default
    // (unmocked) resolved value — harmless here since a 201 response never
    // surfaces `balance` on the success path.
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 } as never); // CAS success
    prismaMock.creditTransaction.create.mockResolvedValueOnce({} as never);
    prismaMock.contactRequest.upsert.mockResolvedValueOnce({
      id: 'cr-1',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'PENDING',
      flashMessageBody: 'Salut, ton profil me plaît beaucoup !',
      createdAt: new Date(),
    } as never);

    const res = await POST(
      makePost({
        targetUserId: 'target-1',
        flashMessageBody: 'Salut, ton profil me plaît beaucoup !',
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'me-1', creditBalance: { gte: 3 } },
      data: { creditBalance: { decrement: 3 } },
    });
    expect(prismaMock.contactRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          flashMessageBody: 'Salut, ton profil me plaît beaucoup !',
        }),
      }),
    );
    // The advisory lock is the first statement inside the transaction —
    // without it, two concurrent requests could both observe "no existing
    // row" and both spend credits before either commits.
    expect(lockSpy).toHaveBeenCalledWith(prismaMock, 'me-1');
    const body = (await res.json()) as { conversationId: string | null };
    expect(body.conversationId).toBeNull();
  });

  it('a flash like with insufficient credits creates nothing and returns 402', async () => {
    prismaMock.contactRequest.findUnique
      .mockResolvedValueOnce(null) // existingRequest — new request (pre-tx)
      .mockResolvedValueOnce(null); // existingFresh — new request (in-tx, under the advisory lock)
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: 'USER' } as never) // contactRequestQuotaStatus's own role check
      .mockResolvedValueOnce({ role: 'USER', profile: { gender: 'HOMME' } } as never) // gender/staff check before spend
      .mockResolvedValueOnce({ creditBalance: 1 } as never); // spendCredits' balance fetch on failure
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 0 } as never); // CAS fails

    const res = await POST(makePost({ targetUserId: 'target-1', flashMessageBody: 'Coucou' }));
    expect(res.status).toBe(402);
    const body = (await res.json()) as { code: string; balance: number; cost: number };
    expect(body.code).toBe('INSUFFICIENT_CREDITS');
    expect(body.balance).toBe(1);
    expect(body.cost).toBe(3);
    expect(prismaMock.like.upsert).not.toHaveBeenCalled();
    expect(prismaMock.contactRequest.upsert).not.toHaveBeenCalled();
    expect(prismaMock.creditTransaction.create).not.toHaveBeenCalled();
  });

  it('mutual match: both requests flip to ACCEPTED, Conversation is created, flash messages inserted oldest-first', async () => {
    const olderCreatedAt = new Date('2026-08-20T10:00:00Z');
    const newerCreatedAt = new Date('2026-08-27T10:00:00Z');
    prismaMock.contactRequest.findUnique
      .mockResolvedValueOnce(null) // existingRequest — new request from me (pre-tx)
      .mockResolvedValueOnce(null) // existingFresh — new request (in-tx, under the advisory lock)
      .mockResolvedValueOnce({
        id: 'reverse-req-1',
        requesterId: 'target-1',
        targetId: 'me-1',
        status: 'PENDING',
        flashMessageBody: 'Salut moi aussi !',
        createdAt: olderCreatedAt,
      } as never); // reverseRequest — mutual match, sent earlier, carried its own flash
    prismaMock.contactRequest.upsert.mockResolvedValueOnce({
      id: 'cr-new-1',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'PENDING',
      flashMessageBody: null,
      createdAt: newerCreatedAt,
    } as never);
    prismaMock.contactRequest.update.mockResolvedValueOnce({
      id: 'cr-new-1',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'ACCEPTED',
    } as never);
    prismaMock.conversation.upsert.mockResolvedValueOnce({ id: 'conv-new-1' } as never);

    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(201);
    expect(prismaMock.contactRequest.update).toHaveBeenCalledWith({
      where: { id: 'cr-new-1' },
      data: { status: 'ACCEPTED' },
    });
    expect(prismaMock.contactRequest.update).toHaveBeenCalledWith({
      where: { id: 'reverse-req-1' },
      data: { status: 'ACCEPTED' },
    });
    // upsert, not create — a Conversation may already exist for this pair
    // (legacy eager-upsert data, or an earlier accept) and must not throw
    // P2002 (final-review finding C1).
    expect(prismaMock.conversation.upsert).toHaveBeenCalledWith({
      where: { userAId_userBId: { userAId: 'me-1', userBId: 'target-1' } },
      create: { userAId: 'me-1', userBId: 'target-1', contactRequestId: 'cr-new-1' },
      update: {},
    });
    // Only the reverse request carried a flash message — inserted once, from its own requester.
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conv-new-1',
        senderId: 'target-1',
        body: 'Salut moi aussi !',
        createdAt: expect.any(Date),
      },
    });
    expect(prismaMock.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-new-1' },
      data: { lastMessageAt: expect.any(Date) },
    });
    const body = (await res.json()) as { conversationId: string | null };
    expect(body.conversationId).toBe('conv-new-1');
    // Mutual match → ungated web push to the target (mirrors the always-on
    // in-app match notification).
    expect(vi.mocked(sendPushToUser)).toHaveBeenCalledWith(
      expect.anything(),
      'target-1',
      expect.objectContaining({ url: expect.stringContaining('/app/messages/') }),
    );
  });

  it('re-liking an existing PENDING request never re-charges or overwrites flashMessageBody', async () => {
    prismaMock.contactRequest.findUnique
      .mockResolvedValueOnce({ id: 'cr-existing' } as never) // existingRequest — NOT new (pre-tx, id-only select)
      .mockResolvedValueOnce({
        id: 'cr-existing',
        requesterId: 'me-1',
        targetId: 'target-1',
        status: 'PENDING',
        flashMessageBody: null,
        createdAt: new Date(),
      } as never) // existingFresh — in-tx re-read, still PENDING (not ACCEPTED)
      .mockResolvedValueOnce(null); // reverseRequest — no mutual match
    prismaMock.contactRequest.upsert.mockResolvedValueOnce({
      id: 'cr-existing',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'PENDING',
      flashMessageBody: null,
      createdAt: new Date(),
    } as never);

    const res = await POST(
      makePost({
        targetUserId: 'target-1',
        flashMessageBody: 'Nouveau message, ne devrait pas compter',
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled(); // no role check → no spend attempted
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.contactRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { status: 'PENDING' } }),
    );
  });

  it('re-liking an already-ACCEPTED request does not reset it back to PENDING (task review finding 2)', async () => {
    prismaMock.contactRequest.findUnique
      .mockResolvedValueOnce({ id: 'cr-accepted' } as never) // existingRequest — NOT new (pre-tx, id-only select)
      .mockResolvedValueOnce({
        id: 'cr-accepted',
        requesterId: 'me-1',
        targetId: 'target-1',
        status: 'ACCEPTED',
        flashMessageBody: null,
        createdAt: new Date(),
      } as never) // existingFresh — in-tx re-read: already ACCEPTED, a live Conversation exists
      .mockResolvedValueOnce(null); // reverseRequest — irrelevant here, request is already ACCEPTED
    prismaMock.contactRequest.upsert.mockResolvedValueOnce({
      id: 'cr-accepted',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'ACCEPTED',
      flashMessageBody: null,
      createdAt: new Date(),
    } as never);

    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(201);
    // Must NOT reset status back to PENDING — that would make an
    // already-matched, live Conversation look unusable to any code gating
    // on ContactRequest.status === 'ACCEPTED'.
    expect(prismaMock.contactRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
  });

  it('mutual match where my own side was already ACCEPTED (legacy Conversation exists): upserts instead of crashing, does not re-deliver my already-sent flash', async () => {
    const myOldCreatedAt = new Date('2026-08-15T10:00:00Z');
    const reverseCreatedAt = new Date('2026-08-27T10:00:00Z');
    prismaMock.contactRequest.findUnique
      .mockResolvedValueOnce({ id: 'cr-mine' } as never) // existingRequest — NOT new (pre-tx)
      .mockResolvedValueOnce({
        id: 'cr-mine',
        requesterId: 'me-1',
        targetId: 'target-1',
        status: 'ACCEPTED', // already accepted earlier — its flash (if any) was
        // already delivered as Message #1 by POST /api/contact-requests/[id]/respond
        flashMessageBody: 'Mon message déjà livré',
        createdAt: myOldCreatedAt,
      } as never) // existingFresh
      .mockResolvedValueOnce({
        id: 'reverse-req-2',
        requesterId: 'target-1',
        targetId: 'me-1',
        status: 'PENDING', // fresh — mutualMatch requires this, so its flash was never delivered
        flashMessageBody: 'Salut, nouveau message flash !',
        createdAt: reverseCreatedAt,
      } as never); // reverseRequest — mutual match
    prismaMock.contactRequest.upsert.mockResolvedValueOnce({
      id: 'cr-mine',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'ACCEPTED',
      flashMessageBody: 'Mon message déjà livré',
      createdAt: myOldCreatedAt,
    } as never);
    prismaMock.contactRequest.update.mockResolvedValueOnce({
      id: 'cr-mine',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'ACCEPTED',
    } as never);
    // A legacy Conversation row already exists for this pair (old
    // eager-upsert behaviour, or an earlier accept) — upsert must resolve
    // it instead of colliding on the unique constraint (final-review C1).
    prismaMock.conversation.upsert.mockResolvedValueOnce({ id: 'conv-existing-1' } as never);

    const res = await POST(makePost({ targetUserId: 'target-1' }));
    expect(res.status).toBe(201);
    expect(prismaMock.conversation.upsert).toHaveBeenCalledWith({
      where: { userAId_userBId: { userAId: 'me-1', userBId: 'target-1' } },
      create: { userAId: 'me-1', userBId: 'target-1', contactRequestId: 'cr-mine' },
      update: {},
    });
    // My own side's flash was already delivered before this transaction —
    // must NOT be re-inserted. Only the reverse side's fresh flash lands.
    expect(prismaMock.message.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conv-existing-1',
        senderId: 'target-1',
        body: 'Salut, nouveau message flash !',
        createdAt: expect.any(Date),
      },
    });
    const body = (await res.json()) as { conversationId: string | null };
    expect(body.conversationId).toBe('conv-existing-1');
  });

  it('a flash from a FEMME sender is silently dropped — no charge, not stored, the like still succeeds', async () => {
    prismaMock.contactRequest.findUnique
      .mockResolvedValueOnce(null) // existingRequest — new request (pre-tx)
      .mockResolvedValueOnce(null) // existingFresh — new request (in-tx, under the advisory lock)
      .mockResolvedValueOnce(null); // reverseRequest — no mutual match
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: 'USER' } as never) // contactRequestQuotaStatus's own role check
      .mockResolvedValueOnce({ role: 'USER', profile: { gender: 'FEMME' } } as never); // gender/staff check before spend
    prismaMock.contactRequest.upsert.mockResolvedValueOnce({
      id: 'cr-1',
      requesterId: 'me-1',
      targetId: 'target-1',
      status: 'PENDING',
      flashMessageBody: null,
      createdAt: new Date(),
    } as never);

    const res = await POST(
      makePost({ targetUserId: 'target-1', flashMessageBody: 'Coucou, ça te dit ?' }),
    );
    expect(res.status).toBe(201);
    // Message Flash is a HOMME-only paid feature (final-review I2) — a
    // FEMME sender's flash is silently dropped: no charge, not stored, the
    // like still succeeds as if no flash had been attached.
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.creditTransaction.create).not.toHaveBeenCalled();
    expect(prismaMock.contactRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ flashMessageBody: null }),
      }),
    );
  });
});
