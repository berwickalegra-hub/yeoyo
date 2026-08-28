// POST /api/admin/support/[userId]/reply — an admin sends a message into an
// end user's support thread. Every mutation is audited via logAdminAction.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn(),
}));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { POST } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockLogAdminAction = vi.mocked(logAdminAction);

const admin = seedAdmin();
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function makePost(userId: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/admin/support/${userId}/reply`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function ctxWith(userId: string): { params: Promise<{ userId: string }> } {
  return { params: Promise.resolve({ userId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockLogAdminAction.mockResolvedValue(undefined as never);
});

describe('POST /api/admin/support/[userId]/reply', () => {
  it('creates an ADMIN-authored message and logs the admin action', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'user_1' } as never);
    prismaMock.supportMessage.create.mockResolvedValueOnce({
      id: 'sm_2',
      senderRole: 'ADMIN',
      senderId: admin.id,
      content: 'On regarde ça tout de suite',
      imageUpload: null,
      createdAt: new Date('2026-08-29T11:00:00.000Z'),
    } as never);

    const res = await POST(
      makePost('user_1', { content: 'On regarde ça tout de suite' }),
      ctxWith('user_1'),
    );

    expect(res.status).toBe(201);
    expect(prismaMock.supportMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_1',
          senderRole: 'ADMIN',
          senderId: admin.id,
          content: 'On regarde ça tout de suite',
        }),
      }),
    );
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: admin.id,
        action: 'support.reply',
        targetType: 'User',
        targetId: 'user_1',
      }),
    );
  });

  it('returns 404 USER_NOT_FOUND for a missing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost('missing', { content: 'Hi' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    expect(prismaMock.supportMessage.create).not.toHaveBeenCalled();
  });

  it('rejects an imageUploadId that does not belong to this admin', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'user_1' } as never);
    prismaMock.fileUpload.findFirst.mockResolvedValueOnce(null as never);

    const res = await POST(
      makePost('user_1', { imageUploadId: 'c'.repeat(24) }),
      ctxWith('user_1'),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('IMAGE_NOT_FOUND');
    expect(prismaMock.supportMessage.create).not.toHaveBeenCalled();
  });

  it('propagates CSRF failure before touching Prisma', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_FAILED' }, { status: 403 }),
    );
    const res = await POST(makePost('user_1', { content: 'Hi' }), ctxWith('user_1'));
    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('propagates 403 from requireAdmin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost('user_1', { content: 'Hi' }), ctxWith('user_1'));
    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
