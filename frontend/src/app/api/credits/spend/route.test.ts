// POST /api/credits/spend — focused on the 2026-08-25 permanent-unlock
// behaviour: a successful non-bypass spend must bump the matching
// Profile.*UnlockedAt column inside the same transaction as the credit
// debit, while a staff bypass must write no unlock marker at all.
//
// 2026-08-28: the route now also fetches the caller's Profile.gender to
// decide the free-for-non-HOMME bypass (see route.ts's header comment) —
// every "real paid spend" test below must mock `profile.findUnique` to
// `{ gender: 'HOMME' }` or it would silently take the free bypass branch
// instead of reaching spendCredits.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'me-1', email: 'me@example.com' } };

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/credits/spend', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(undefined);
  });
});

describe('POST /api/credits/spend — permanent unlock bump', () => {
  it('bumps Profile.visitorsUnlockedAt on a successful non-bypass spend for view_visitors', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'USER' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({ gender: 'HOMME' } as never);
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.creditTransaction.create.mockResolvedValueOnce({} as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({ creditBalance: 4 } as never);
    prismaMock.profile.update.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ action: 'view_visitors' }));

    expect(res.status).toBe(200);
    expect(prismaMock.profile.update).toHaveBeenCalledWith({
      where: { userId: 'me-1' },
      data: { visitorsUnlockedAt: expect.any(Date) },
    });
  });

  it('bumps Profile.favoritedByUnlockedAt on a successful non-bypass spend for view_favorited_by', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'USER' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({ gender: 'HOMME' } as never);
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.creditTransaction.create.mockResolvedValueOnce({} as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({ creditBalance: 4 } as never);
    prismaMock.profile.update.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ action: 'view_favorited_by' }));

    expect(res.status).toBe(200);
    expect(prismaMock.profile.update).toHaveBeenCalledWith({
      where: { userId: 'me-1' },
      data: { favoritedByUnlockedAt: expect.any(Date) },
    });
  });

  it('bumps the unlock marker but charges nothing for a non-HOMME (FEMME) account', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'USER' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({ gender: 'FEMME' } as never);
    prismaMock.profile.update.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ action: 'view_favorited_by' }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { bypass: boolean };
    expect(body.bypass).toBe(true);
    expect(prismaMock.profile.update).toHaveBeenCalledWith({
      where: { userId: 'me-1' },
      data: { favoritedByUnlockedAt: expect.any(Date) },
    });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.creditTransaction.create).not.toHaveBeenCalled();
  });

  it('writes no unlock marker and returns unlimited bypass for ADMIN/SUPERADMIN staff', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'ADMIN' } as never);

    const res = await POST(makePost({ action: 'view_visitors' }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { bypass: boolean };
    expect(body.bypass).toBe(true);
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('writes no unlock marker and returns 402 when the balance is insufficient', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'USER' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({ gender: 'HOMME' } as never);
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({ creditBalance: 0 } as never);

    const res = await POST(makePost({ action: 'view_favorited_by' }));

    expect(res.status).toBe(402);
    const body = (await res.json()) as { code: string; balance: number };
    expect(body.code).toBe('INSUFFICIENT_CREDITS');
    expect(body.balance).toBe(0);
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
  });

  it('propagates 401 from requireAuth without touching the DB', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost({ action: 'view_visitors' }));
    expect(res.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid action with 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ action: 'not_a_real_action' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('VALIDATION_FAILED');
  });
});
