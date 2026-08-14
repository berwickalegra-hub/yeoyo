// GET /api/admin/reports — the "Signalements" queue listing (cursor
// pagination + status filter, defaults to PENDING). Gated at MODERATOR
// (not just ADMIN) per the Task 3 access widening.
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
import { seedAdmin, seedModerator } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function seedReport(overrides: Partial<{ id: string; status: string; createdAt: Date }> = {}) {
  return {
    id: overrides.id ?? 'report_1',
    reporterId: 'user_reporter',
    targetId: 'user_target',
    reason: 'HARASSMENT',
    details: null,
    status: overrides.status ?? 'PENDING',
    resolvedAt: null,
    createdAt: overrides.createdAt ?? new Date('2026-05-01T00:00:00.000Z'),
    reporter: { id: 'user_reporter', email: 'reporter@test.local', name: null },
    target: { id: 'user_target', email: 'target@test.local', name: null },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('/api/admin/reports — list', () => {
  it('GET returns pending reports newest-first by default', async () => {
    const r1 = seedReport({ id: 'r1' });
    prismaMock.report.findMany.mockResolvedValueOnce([r1] as never);
    prismaMock.report.count.mockResolvedValueOnce(1 as never);

    const res = await GET(makeGet('http://test/api/admin/reports'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
      total: number;
    };
    expect(body.items.map((r) => r.id)).toEqual(['r1']);
    expect(body.nextCursor).toBeNull();
    expect(body.total).toBe(1);

    const args = prismaMock.report.findMany.mock.calls[0]?.[0];
    const where = args?.where as Record<string, unknown> | undefined;
    expect(where?.['status']).toBe('PENDING');
    expect(args?.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(prismaMock.report.count.mock.calls[0]?.[0]).toEqual({ where: { status: 'PENDING' } });
  });

  it('GET returns empty 200 (never 404) on no rows', async () => {
    prismaMock.report.findMany.mockResolvedValueOnce([] as never);
    prismaMock.report.count.mockResolvedValueOnce(0 as never);
    const res = await GET(makeGet('http://test/api/admin/reports'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null, total: 0 });
  });

  it('GET filters by status=RESOLVED', async () => {
    prismaMock.report.findMany.mockResolvedValueOnce([] as never);
    prismaMock.report.count.mockResolvedValueOnce(0 as never);
    await GET(makeGet('http://test/api/admin/reports?status=RESOLVED'));
    const args = prismaMock.report.findMany.mock.calls[0]?.[0];
    const where = args?.where as Record<string, unknown> | undefined;
    expect(where?.['status']).toBe('RESOLVED');
  });

  it('GET cursor pagination emits nextCursor when hasMore', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => seedReport({ id: `r${i}` }));
    rows.forEach((r, i) => {
      r.createdAt = new Date(Date.UTC(2026, 4, 21 - i));
    });
    prismaMock.report.findMany.mockResolvedValueOnce(rows as never);
    prismaMock.report.count.mockResolvedValueOnce(21 as never);

    const res = await GET(makeGet('http://test/api/admin/reports'));
    const body = (await res.json()) as { items: Array<{ id: string }>; nextCursor: string | null };
    expect(body.items).toHaveLength(20);
    expect(body.nextCursor).not.toBeNull();
    const args = prismaMock.report.findMany.mock.calls[0]?.[0];
    expect(args?.take).toBe(21);
  });

  it('GET allows MODERATOR (not just ADMIN)', async () => {
    const moderator = seedModerator();
    mockRequireAdmin.mockResolvedValueOnce({
      user: { sub: moderator.id, email: moderator.email },
      admin: { id: moderator.id, email: moderator.email, role: 'MODERATOR' as const },
    });
    prismaMock.report.findMany.mockResolvedValueOnce([] as never);
    prismaMock.report.count.mockResolvedValueOnce(0 as never);
    const res = await GET(makeGet('http://test/api/admin/reports'));
    expect(res.status).toBe(200);
  });

  it('GET rate limits admin per-userId — propagates 429', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet('http://test/api/admin/reports'));
    expect(res.status).toBe(429);
    expect(prismaMock.report.findMany).not.toHaveBeenCalled();
  });

  it('GET propagates 403 from requireAdmin (below MODERATOR)', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/reports'));
    expect(res.status).toBe(403);
    expect(prismaMock.report.findMany).not.toHaveBeenCalled();
  });
});
