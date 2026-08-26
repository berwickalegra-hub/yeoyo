import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { seedAdminInvite } from '@/test-utils/admin-fixtures';
import { generateUniqueAffiliateCode } from '@/lib/server/affiliates/code';

vi.mock('@/lib/server/affiliates/code', () => ({
  generateUniqueAffiliateCode: vi.fn(),
}));

// This route's `limiter` is built once at module-import time from a single
// in-memory bucket (no redis configured in the test env), keyed by source
// IP — every POST in this file shares that ONE bucket for the file's whole
// run since NextRequest here never sets a distinguishing IP header. Mock it
// out so the number of tests in this file isn't silently capped by
// ADMIN_INVITE_ACCEPT_RATE_LIMIT_MAX (default 10) — rate-limiting isn't
// what any test in this file is exercising.
vi.mock('@/lib/server/middleware/rate-limit-by-email', () => ({
  createEmailLimiter: vi.fn().mockReturnValue({
    check: vi.fn().mockResolvedValue(null),
    refund: vi.fn().mockResolvedValue(undefined),
  }),
}));

const mockGenerateCode = vi.mocked(generateUniqueAffiliateCode);

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/invites/accept', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/admin/invites/accept', () => {
  it('rejects a too-short password before any invite lookup', async () => {
    const res = await POST(makePost({ token: 'raw-token-value', password: 'short1' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('PASSWORD_TOO_SHORT');
    expect(prismaMock.adminInvite.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a banned password with no user/invite mutation', async () => {
    // 'password123' is in the banned-list fixture (banned-passwords.ts) and
    // is >=10 chars, so it exercises the banned check specifically rather
    // than tripping the length check first.
    const res = await POST(makePost({ token: 'raw-token-value', password: 'password123' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('PASSWORD_BANNED');
    // Password policy runs BEFORE the invite lookup — a banned password
    // never even reaches prisma.
    expect(prismaMock.adminInvite.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.adminInvite.updateMany).not.toHaveBeenCalled();
  });

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
    // Birth of an admin account is the most privileged mutation this route
    // performs — must be auditable, same as every other admin mutation.
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'new_user_1',
          action: 'admin.invite_accepted',
          targetId: 'new_user_1',
        }),
      }),
    );
  });

  it('bumps tokenVersion when an invite is accepted by an email that already has a User row (invalidates pre-existing sessions)', async () => {
    const invite = seedAdminInvite({
      email: 'already-a-user@test.local',
      role: 'ADMIN',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'existing_user_1',
      email: 'already-a-user@test.local',
      emailVerifiedAt: new Date(),
    } as never);
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.adminInvite.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.user.update.mockResolvedValueOnce({ id: 'existing_user_1' } as never);

    const res = await POST(
      makePost({ token: 'raw-token-value', password: 'a-strong-password-123' }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing_user_1' },
        data: expect.objectContaining({
          role: 'ADMIN',
          tokenVersion: { increment: 1 },
        }),
      }),
    );
    expect(prismaMock.user.create).not.toHaveBeenCalled();
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

  it('generates and sets affiliateCode when accepting an AFFILIATE invite (new user)', async () => {
    const invite = seedAdminInvite({
      email: 'aff@test.local',
      role: 'AFFILIATE' as never,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    mockGenerateCode.mockResolvedValueOnce('AFF99988');
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.adminInvite.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.user.create.mockResolvedValueOnce({ id: 'new_affiliate_1' } as never);

    const res = await POST(
      makePost({ token: 'raw-token-value', password: 'a-strong-password-123' }),
    );
    expect(res.status).toBe(200);
    expect(mockGenerateCode).toHaveBeenCalledOnce();
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'AFFILIATE', affiliateCode: 'AFF99988' }),
      }),
    );
  });

  it('never regenerates affiliateCode when promoting an existing user who already has one', async () => {
    const invite = seedAdminInvite({
      email: 'aff2@test.local',
      role: 'AFFILIATE' as never,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    mockGenerateCode.mockResolvedValueOnce('AFF11122');
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'existing_1',
      email: 'aff2@test.local',
      affiliateCode: 'ALREADY1',
      emailVerifiedAt: new Date(),
    } as never);
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.adminInvite.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const res = await POST(
      makePost({ token: 'raw-token-value-2', password: 'a-strong-password-123' }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ affiliateCode: expect.anything() }),
      }),
    );
  });

  it('sets affiliateCode when promoting an existing user who does not yet have one', async () => {
    const invite = seedAdminInvite({
      email: 'aff3@test.local',
      role: 'AFFILIATE' as never,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    mockGenerateCode.mockResolvedValueOnce('AFF77788');
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'existing_2',
      email: 'aff3@test.local',
      affiliateCode: null,
      emailVerifiedAt: new Date(),
    } as never);
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.adminInvite.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const res = await POST(
      makePost({ token: 'raw-token-value-3', password: 'a-strong-password-123' }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ affiliateCode: 'AFF77788' }),
      }),
    );
  });

  it('copies invite.name onto the new User row when the invite carries one', async () => {
    const invite = seedAdminInvite({
      email: 'named-aff@test.local',
      role: 'AFFILIATE' as never,
      name: 'Awa Diop',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    } as never);
    mockGenerateCode.mockResolvedValueOnce('AFF55511');
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.adminInvite.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.user.create.mockResolvedValueOnce({ id: 'new_named_1' } as never);

    const res = await POST(
      makePost({ token: 'raw-token-value', password: 'a-strong-password-123' }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Awa Diop' }),
      }),
    );
  });

  it('copies invite.name onto an existing User row being promoted, when the invite carries one', async () => {
    const invite = seedAdminInvite({
      email: 'named-existing@test.local',
      role: 'AFFILIATE' as never,
      name: 'Moussa Ba',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    } as never);
    mockGenerateCode.mockResolvedValueOnce('AFF66622');
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'existing_named_1',
      email: 'named-existing@test.local',
      affiliateCode: null,
      emailVerifiedAt: new Date(),
    } as never);
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.adminInvite.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const res = await POST(
      makePost({ token: 'raw-token-value', password: 'a-strong-password-123' }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Moussa Ba' }),
      }),
    );
  });

  it('does not set name at all when the invite carries no name (MODERATOR/ADMIN invites never set it)', async () => {
    const invite = seedAdminInvite({
      email: 'no-name-mod@test.local',
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
    prismaMock.adminInvite.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.user.create.mockResolvedValueOnce({ id: 'no_name_user_1' } as never);

    await POST(makePost({ token: 'raw-token-value', password: 'a-strong-password-123' }));
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ name: expect.anything() }),
      }),
    );
  });

  it('returns the accepted invite role in the response body (so the client can route the post-accept redirect)', async () => {
    const invite = seedAdminInvite({
      email: 'role-in-response@test.local',
      role: 'AFFILIATE' as never,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    mockGenerateCode.mockResolvedValueOnce('AFF33344');
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.adminInvite.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    prismaMock.user.create.mockResolvedValueOnce({ id: 'role_resp_1' } as never);

    const res = await POST(
      makePost({ token: 'raw-token-value', password: 'a-strong-password-123' }),
    );
    const body = (await res.json()) as { ok: boolean; role: string };
    expect(body.role).toBe('AFFILIATE');
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
