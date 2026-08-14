import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { seedAdminInvite } from '@/test-utils/admin-fixtures';

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/invites/accept', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/admin/invites/accept', () => {
  it('creates the admin user and marks the invite accepted', async () => {
    // seedAdminInvite()'s default expiresAt is anchored to the fixture
    // module's FROZEN_NOW (2026-05-08), which is in the past relative to
    // the real clock this route reads via Date.now() — override so the
    // pre-check doesn't short-circuit as expired.
    const invite = seedAdminInvite({
      email: 'new-mod@test.local',
      role: 'MODERATOR',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    // WR-05-style atomic guard — the route consumes the invite via
    // `updateMany({ where: { acceptedAt: null, revokedAt: null,
    // expiresAt: { gt: now } } })` inside the same tx as the User write
    // (see route.ts comment) rather than a bare `.update()`, so a
    // concurrent second acceptor can't also pass the pre-tx checks and
    // create a duplicate User row.
    prismaMock.adminInvite.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.user.create.mockResolvedValueOnce({ id: 'new_user_1' } as never);

    const res = await POST(
      makePost({ token: 'raw-token-value', password: 'a-strong-password-123' }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.adminInvite.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: invite.id,
          acceptedAt: null,
          revokedAt: null,
        }),
        data: { acceptedAt: expect.any(Date) },
      }),
    );
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'new-mod@test.local', role: 'MODERATOR' }),
      }),
    );
  });

  it('rejects an expired invite', async () => {
    const invite = seedAdminInvite({ expiresAt: new Date(Date.now() - 1000) });
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);

    const res = await POST(makePost({ token: 'raw-token-value', password: 'x'.repeat(12) }));
    expect(res.status).toBe(400);
  });

  it('rejects an already-accepted invite', async () => {
    const invite = seedAdminInvite({ acceptedAt: new Date() });
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);

    const res = await POST(makePost({ token: 'raw-token-value', password: 'x'.repeat(12) }));
    expect(res.status).toBe(400);
  });

  it('rejects the second of two concurrent accepts (race-safety guard)', async () => {
    // Simulates a racer that passed the pre-tx findUnique checks but loses
    // the atomic updateMany because another request already consumed the
    // invite between the read and the write.
    const invite = seedAdminInvite({
      email: 'race@test.local',
      role: 'MODERATOR',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.adminInvite.updateMany.mockResolvedValueOnce({ count: 0 } as never);

    const res = await POST(makePost({ token: 'raw-token-value', password: 'x'.repeat(12) }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVITE_ALREADY_ACCEPTED');
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});
