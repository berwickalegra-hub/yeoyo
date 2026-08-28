// GET /api/admin/support/[userId] — full thread + bulk mark-as-read on open.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const admin = seedAdmin();
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function ctxWith(userId: string): { params: Promise<{ userId: string }> } {
  return { params: Promise.resolve({ userId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/support/[userId]', () => {
  it('returns the thread and marks unread USER messages as read', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'user@test.local',
      name: null,
      avatarUrl: null,
    } as never);
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([
      {
        id: 'sm_1',
        senderRole: 'USER',
        senderId: 'user_1',
        content: 'Aide-moi',
        imageUpload: null,
        createdAt: new Date('2026-08-29T09:00:00.000Z'),
      },
    ] as never);
    prismaMock.supportMessage.updateMany.mockResolvedValueOnce({ count: 1 } as never);

    const res = await GET(
      new NextRequest('http://test/api/admin/support/user_1'),
      ctxWith('user_1'),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.supportMessage.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', senderRole: 'USER', readByAdminAt: null },
      data: { readByAdminAt: expect.any(Date) },
    });
    const body = (await res.json()) as { messages: { content: string }[] };
    expect(body.messages).toHaveLength(1);
  });

  it('returns 404 USER_NOT_FOUND for a missing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    const res = await GET(
      new NextRequest('http://test/api/admin/support/missing'),
      ctxWith('missing'),
    );
    expect(res.status).toBe(404);
    expect(prismaMock.supportMessage.findMany).not.toHaveBeenCalled();
  });

  it('propagates 403 from requireAdmin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(
      new NextRequest('http://test/api/admin/support/user_1'),
      ctxWith('user_1'),
    );
    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
