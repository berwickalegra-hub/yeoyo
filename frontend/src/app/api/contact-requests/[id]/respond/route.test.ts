// POST /api/contact-requests/[id]/respond — accept/decline a contact
// request. Focus: the FIRST_MATCH_BONUS affiliate payout wired into the
// ACCEPT branch (one-time-ever per referred FEMME, mirrors the
// verification-bonus pattern in verification-queue/[id]/process/route.ts).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/notifications/templates', () => ({
  contactRequestAccepted: vi.fn(() => ({ type: 'CONTACT_REQUEST_ACCEPTED' })),
  contactRequestDeclined: vi.fn(() => ({ type: 'CONTACT_REQUEST_DECLINED' })),
}));

import { requireAuth } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);

function participant(overrides: {
  id: string;
  referredByAffiliateId?: string | null;
  gender?: string | null;
}) {
  return {
    id: overrides.id,
    referredByAffiliateId: overrides.referredByAffiliateId ?? null,
    profile: overrides.gender ? { gender: overrides.gender } : null,
  };
}

function makePost(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/contact-requests/${id}/respond`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const ACCEPTER_ID = 'accepter_1'; // always auth.user.sub — the route 404s otherwise
const REQUESTER_ID = 'requester_1';

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ user: { sub: ACCEPTER_ID, email: 'a@test.local' } });
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(undefined);
  });
  prismaMock.contactRequest.findUnique.mockResolvedValue({
    id: 'req_1',
    requesterId: REQUESTER_ID,
    targetId: ACCEPTER_ID,
    status: 'PENDING',
  } as never);
  prismaMock.contactRequest.update.mockResolvedValue({ status: 'ACCEPTED' } as never);
  prismaMock.conversation.upsert.mockResolvedValue({ id: 'conv_1' } as never);
  prismaMock.profile.findUnique.mockResolvedValue({ firstName: 'Awa' } as never);
  prismaMock.user.findMany.mockResolvedValue([] as never);
  prismaMock.affiliateEarning.findMany.mockResolvedValue([] as never);
});

describe('POST /api/contact-requests/[id]/respond — FIRST_MATCH_BONUS', () => {
  it('inserts a 30 FCFA FIRST_MATCH_BONUS when the accepter is a referred FEMME', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      participant({ id: REQUESTER_ID }),
      participant({ id: ACCEPTER_ID, referredByAffiliateId: 'aff_1', gender: 'FEMME' }),
    ] as never);

    const res = await POST(makePost('req_1', { action: 'ACCEPT' }), ctxWith('req_1'));
    expect(res.status).toBe(200);
    expect(prismaMock.affiliateEarning.createMany).toHaveBeenCalledWith({
      data: [
        {
          affiliateId: 'aff_1',
          referredUserId: ACCEPTER_ID,
          type: 'FIRST_MATCH_BONUS',
          amount: 30,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('inserts the bonus when the REQUESTER is the referred FEMME, not just the accepter', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      participant({ id: REQUESTER_ID, referredByAffiliateId: 'aff_2', gender: 'FEMME' }),
      participant({ id: ACCEPTER_ID }),
    ] as never);

    await POST(makePost('req_1', { action: 'ACCEPT' }), ctxWith('req_1'));
    expect(prismaMock.affiliateEarning.createMany).toHaveBeenCalledWith({
      data: [
        {
          affiliateId: 'aff_2',
          referredUserId: REQUESTER_ID,
          type: 'FIRST_MATCH_BONUS',
          amount: 30,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('never inserts a bonus for a referred HOMME (FEMME-only)', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      participant({ id: REQUESTER_ID, referredByAffiliateId: 'aff_1', gender: 'HOMME' }),
      participant({ id: ACCEPTER_ID }),
    ] as never);

    await POST(makePost('req_1', { action: 'ACCEPT' }), ctxWith('req_1'));
    expect(prismaMock.affiliateEarning.createMany).not.toHaveBeenCalled();
  });

  it('never inserts a bonus when neither participant was referred', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      participant({ id: REQUESTER_ID, gender: 'FEMME' }),
      participant({ id: ACCEPTER_ID, gender: 'FEMME' }),
    ] as never);

    await POST(makePost('req_1', { action: 'ACCEPT' }), ctxWith('req_1'));
    expect(prismaMock.affiliateEarning.createMany).not.toHaveBeenCalled();
  });

  it('skips a referred FEMME who already has a FIRST_MATCH_BONUS (app-level pre-check)', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      participant({ id: REQUESTER_ID }),
      participant({ id: ACCEPTER_ID, referredByAffiliateId: 'aff_1', gender: 'FEMME' }),
    ] as never);
    prismaMock.affiliateEarning.findMany.mockResolvedValueOnce([
      { referredUserId: ACCEPTER_ID },
    ] as never);

    await POST(makePost('req_1', { action: 'ACCEPT' }), ctxWith('req_1'));
    expect(prismaMock.affiliateEarning.createMany).not.toHaveBeenCalled();
  });

  it('pays both sides when both participants are referred, un-bonused FEMMEs', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      participant({ id: REQUESTER_ID, referredByAffiliateId: 'aff_1', gender: 'FEMME' }),
      participant({ id: ACCEPTER_ID, referredByAffiliateId: 'aff_2', gender: 'FEMME' }),
    ] as never);

    await POST(makePost('req_1', { action: 'ACCEPT' }), ctxWith('req_1'));
    expect(prismaMock.affiliateEarning.createMany).toHaveBeenCalledWith({
      data: [
        {
          affiliateId: 'aff_1',
          referredUserId: REQUESTER_ID,
          type: 'FIRST_MATCH_BONUS',
          amount: 30,
        },
        {
          affiliateId: 'aff_2',
          referredUserId: ACCEPTER_ID,
          type: 'FIRST_MATCH_BONUS',
          amount: 30,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('never touches affiliateEarning on DECLINE', async () => {
    await POST(makePost('req_1', { action: 'DECLINE' }), ctxWith('req_1'));
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    expect(prismaMock.affiliateEarning.createMany).not.toHaveBeenCalled();
  });

  it('still returns 200 + conversationId on a normal accept with no referral involved', async () => {
    const res = await POST(makePost('req_1', { action: 'ACCEPT' }), ctxWith('req_1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; conversationId: string };
    expect(body).toEqual({ status: 'ACCEPTED', conversationId: 'conv_1' });
  });
});
