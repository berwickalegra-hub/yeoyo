// GET /api/admin/support — the Support inbox list, grouped by userId (no
// separate thread wrapper, see route.ts's own header comment). MODERATOR+.
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

// prisma.supportMessage.groupBy's overloaded generic signature confuses
// vitest-mock-extended's typing — same fix as conversations/route.test.ts's
// prisma.message.groupBy cast (that file's own comment: "cast the mock
// itself rather than the resolved value").
const groupByMock = prismaMock.supportMessage.groupBy as unknown as {
  mockResolvedValueOnce: (v: unknown[]) => typeof groupByMock;
};

const admin = seedAdmin();
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/support', () => {
  it('returns an empty inbox with unreadThreads=0 when nobody has messaged', async () => {
    groupByMock
      .mockResolvedValueOnce([]) // page slice
      .mockResolvedValueOnce([]) // totalGroups
      .mockResolvedValueOnce([]); // unreadThreads

    const res = await GET(new NextRequest('http://test/api/admin/support?limit=1'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; unreadThreads: number };
    expect(body.items).toEqual([]);
    expect(body.unreadThreads).toBe(0);
  });

  it('lists one thread per userId with its last message and unread count', async () => {
    const lastActivity = new Date('2026-08-29T10:00:00.000Z');
    groupByMock
      .mockResolvedValueOnce([{ userId: 'user_1', _max: { createdAt: lastActivity } }]) // page slice
      .mockResolvedValueOnce([{ userId: 'user_1' }]) // totalGroups
      .mockResolvedValueOnce([{ userId: 'user_1' }]) // unreadThreads
      .mockResolvedValueOnce([{ userId: 'user_1', _count: { id: 2 } }]); // per-thread unreadCount
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: 'user_1', email: 'user@test.local', name: null, avatarUrl: null },
    ] as never);
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([
      {
        userId: 'user_1',
        content: 'Toujours pas résolu',
        senderRole: 'USER',
        createdAt: lastActivity,
      },
    ] as never);

    const res = await GET(new NextRequest('http://test/api/admin/support'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { userId: string; unreadCount: number; lastMessage: { content: string } | null }[];
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.unreadCount).toBe(2);
    expect(body.items[0]?.lastMessage?.content).toBe('Toujours pas résolu');
  });

  it('propagates 403 from requireAdmin (below MODERATOR)', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(new NextRequest('http://test/api/admin/support'));
    expect(res.status).toBe(403);
    expect(prismaMock.supportMessage.groupBy).not.toHaveBeenCalled();
  });
});
