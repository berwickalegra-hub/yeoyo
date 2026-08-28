// GET/POST /api/conversations/[id]/messages — this route had zero test
// coverage before Message Flash (2026-08-27). Added now specifically to
// prove computeFirstMessageCost's existing messageCount===0 check can't
// double-charge on top of a flash message: because a flash message lands
// as the conversation's Message #1 (see POST /api/contact-requests/[id]/
// respond and POST /api/likes' mutual-match branch), by the time a man
// sends his own first line through THIS route, messageCount is already 1
// — the exact same code path as "not the first message in any ordinary
// conversation", no special-casing needed.
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
  isBlockedEitherWay: vi.fn(() => false),
}));
vi.mock('@/lib/server/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/push', () => ({
  sendPushToUser: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { sendPushToUser } from '@/lib/server/push';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const MAN_ID = 'man-1';
const WOMAN_ID = 'woman-1';
const CONVERSATION_ID = 'conv-1';

function makePost(body: unknown): NextRequest {
  return new NextRequest(`http://test/api/conversations/${CONVERSATION_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function ctx(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: CONVERSATION_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(undefined);
  });
  prismaMock.conversation.findUnique.mockResolvedValue({
    id: CONVERSATION_ID,
    userAId: MAN_ID,
    userBId: WOMAN_ID,
    mutedByUserA: false,
    mutedByUserB: false,
  } as never);
  prismaMock.notificationPreferences.findUnique.mockResolvedValue(null);
});

describe('POST /api/conversations/[id]/messages — first-message credit interaction', () => {
  it('charges 1 credit for a HOMME sending the true first message (messageCount 0)', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: MAN_ID, email: 'm@test.local' } });
    prismaMock.message.count.mockResolvedValueOnce(0);
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ role: 'USER', profile: { gender: 'HOMME' } } as never) // in-tx role/gender check
      .mockResolvedValueOnce({ creditBalance: 4 } as never); // spendCredits' post-spend balance
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.creditTransaction.create.mockResolvedValueOnce({} as never);
    prismaMock.message.create.mockResolvedValueOnce({
      id: 'msg-1',
      senderId: MAN_ID,
      body: 'Salut !',
      imageUpload: null,
      createdAt: new Date(),
    } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({ firstName: 'Jean' } as never);

    const res = await POST(makePost({ body: 'Salut !' }), ctx());

    expect(res.status).toBe(201);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: MAN_ID, creditBalance: { gte: 1 } },
      data: { creditBalance: { decrement: 1 } },
    });
  });

  it("does NOT charge a second credit for the man's next message once messageCount is 1 — the flash-originated-conversation case", async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: MAN_ID, email: 'm@test.local' } });
    // messageCount is 1 here specifically because a flash message already
    // landed as Message #1 (Task 3's insertion) — from this route's own
    // point of view it's indistinguishable from any other non-empty
    // conversation, which is exactly the point of this test.
    prismaMock.message.count.mockResolvedValueOnce(1);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      role: 'USER',
      profile: { gender: 'HOMME' },
    } as never);
    prismaMock.message.create.mockResolvedValueOnce({
      id: 'msg-2',
      senderId: MAN_ID,
      body: 'Comment vas-tu ?',
      imageUpload: null,
      createdAt: new Date(),
    } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({ firstName: 'Jean' } as never);

    const res = await POST(makePost({ body: 'Comment vas-tu ?' }), ctx());

    expect(res.status).toBe(201);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.creditTransaction.create).not.toHaveBeenCalled();
  });

  it('never charges a FEMME sender regardless of messageCount', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: WOMAN_ID, email: 'w@test.local' } });
    prismaMock.message.count.mockResolvedValueOnce(0);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      role: 'USER',
      profile: { gender: 'FEMME' },
    } as never);
    prismaMock.message.create.mockResolvedValueOnce({
      id: 'msg-3',
      senderId: WOMAN_ID,
      body: 'Bonjour !',
      imageUpload: null,
      createdAt: new Date(),
    } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({ firstName: 'Awa' } as never);

    const res = await POST(makePost({ body: 'Bonjour !' }), ctx());

    expect(res.status).toBe(201);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('fires a web push to the recipient on a successful send', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: MAN_ID, email: 'm@test.local' } });
    // messageCount 1 → no credit path, keeps the setup minimal; push fires
    // regardless of the credit branch.
    prismaMock.message.count.mockResolvedValueOnce(1);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      role: 'USER',
      profile: { gender: 'HOMME' },
    } as never);
    prismaMock.message.create.mockResolvedValueOnce({
      id: 'msg-push',
      senderId: MAN_ID,
      body: 'Coucou',
      imageUpload: null,
      createdAt: new Date(),
    } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({ firstName: 'Jean' } as never);

    const res = await POST(makePost({ body: 'Coucou' }), ctx());

    expect(res.status).toBe(201);
    expect(vi.mocked(sendPushToUser)).toHaveBeenCalledWith(
      expect.anything(),
      WOMAN_ID,
      expect.objectContaining({ url: expect.stringContaining('/app/messages/') }),
    );
  });

  it('propagates 401 from requireAuth without touching the DB', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ body: 'Salut' }), ctx());
    expect(res.status).toBe(401);
    expect(prismaMock.conversation.findUnique).not.toHaveBeenCalled();
  });
});
