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

import { requireAuth } from '@/lib/server/middleware';
import { isBlockedEitherWay } from '@/lib/server/blocks';
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
  prismaMock.conversation.upsert.mockResolvedValue({ id: 'conv-1' } as never);
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
