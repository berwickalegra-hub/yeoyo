// POST /api/admin/users/[id]/moderation — hold / release a member's profile.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { POST } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockLog = vi.mocked(logAdminAction);

const admin = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function makePost(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/admin/users/${id}/moderation`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
const ctxWith = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockLog.mockResolvedValue(undefined as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(undefined);
  });
});

describe('POST /api/admin/users/[id]/moderation', () => {
  it('HOLD sets the fields, posts an Équipe YeOyo message, and audits', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({
      id: 'p1',
      moderationHeldAt: null,
      moderationReason: null,
    } as never);
    prismaMock.profile.update.mockResolvedValueOnce({} as never);
    prismaMock.supportMessage.create.mockResolvedValueOnce({} as never);

    const res = await POST(
      makePost('u1', { action: 'HOLD', reason: 'Photo non autorisée' }),
      ctxWith('u1'),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { moderation: { held: boolean; reason: string } };
    expect(body.moderation.held).toBe(true);
    expect(body.moderation.reason).toBe('Photo non autorisée');

    const upd = prismaMock.profile.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(upd.data.moderationHeldAt).toBeInstanceOf(Date);
    expect(upd.data.moderationReason).toBe('Photo non autorisée');

    const msg = prismaMock.supportMessage.create.mock.calls[0]?.[0] as {
      data: { userId: string; senderRole: string; content: string };
    };
    expect(msg.data.userId).toBe('u1');
    expect(msg.data.senderRole).toBe('ADMIN');
    expect(msg.data.content).toContain('Photo non autorisée');

    expect(mockLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'profile.hold', targetId: 'u1' }),
    );
  });

  it('RELEASE clears the fields and posts the "live again" message', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u2' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({
      id: 'p2',
      moderationHeldAt: new Date(),
      moderationReason: 'Photo non autorisée',
    } as never);
    prismaMock.profile.update.mockResolvedValueOnce({} as never);
    prismaMock.supportMessage.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost('u2', { action: 'RELEASE' }), ctxWith('u2'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { moderation: { held: boolean } };
    expect(body.moderation.held).toBe(false);

    const upd = prismaMock.profile.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(upd.data.moderationHeldAt).toBeNull();
    expect(mockLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'profile.release', targetId: 'u2' }),
    );
  });

  it('HOLD on an already-held profile is a no-op (no message, no audit)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u3' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({
      id: 'p3',
      moderationHeldAt: new Date(),
      moderationReason: 'x',
    } as never);

    const res = await POST(makePost('u3', { action: 'HOLD', reason: 'again' }), ctxWith('u3'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { moderation: { noop: boolean } };
    expect(body.moderation.noop).toBe(true);
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
    expect(prismaMock.supportMessage.create).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('rejects HOLD with no / too-short reason', async () => {
    const res = await POST(makePost('u1', { action: 'HOLD', reason: 'x' }), ctxWith('u1'));
    expect(res.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('404 when the profile does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u9' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(
      makePost('u9', { action: 'HOLD', reason: 'whatever reason' }),
      ctxWith('u9'),
    );
    expect(res.status).toBe(404);
  });
});
