import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
});
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET, POST } from './route';
import { seedSuperadmin, seedAdminInvite } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/affiliates', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  const superadmin = seedSuperadmin();
  mockRequireSuperadmin.mockResolvedValue({
    user: { sub: superadmin.id, email: superadmin.email },
    admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
  });
  mockRateLimit.mockResolvedValue(null);
});

describe('POST /api/admin/affiliates', () => {
  it('creates an AFFILIATE-role invite, enqueues the email, logs the action, returns 201', async () => {
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.adminInvite.create.mockResolvedValueOnce(
      seedAdminInvite({
        email: 'new-affiliate@test.local',
        role: 'AFFILIATE' as never,
      }) as never,
    );
    prismaMock.outboxEvent.create.mockResolvedValueOnce({ id: 'outbox_1' } as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ email: 'new-affiliate@test.local', name: 'Awa D.' }));
    expect(res.status).toBe(201);
    expect(prismaMock.adminInvite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'new-affiliate@test.local', role: 'AFFILIATE' }),
      }),
    );
    expect(prismaMock.outboxEvent.create).toHaveBeenCalled();
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'affiliate.create' }),
      }),
    );
  });

  it('rejects a missing name', async () => {
    const res = await POST(makePost({ email: 'x@test.local' }));
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('propagates 403 from requireSuperadmin', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost({ email: 'x@test.local', name: 'X' }));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/affiliates', () => {
  function makeGet(url = 'http://test/api/admin/affiliates'): NextRequest {
    return new NextRequest(url, { method: 'GET' });
  }

  it('returns affiliates with owed totals and last-paid dates', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      {
        id: 'aff_1',
        email: 'a1@test.local',
        name: 'Awa',
        affiliateCode: 'AFF00001',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ] as never);
    // prisma.affiliateEarning.groupBy's overloaded generic signature confuses
    // vitest-mock-extended's typing (same pitfall as
    // src/app/api/conversations/route.test.ts's message.groupBy) — cast the
    // mock itself rather than the resolved value.
    const groupByMock = prismaMock.affiliateEarning.groupBy as unknown as {
      mockResolvedValueOnce: (v: unknown[]) => { mockResolvedValueOnce: (v: unknown[]) => void };
    };
    groupByMock
      .mockResolvedValueOnce([{ affiliateId: 'aff_1', _sum: { amount: 4500 } }])
      .mockResolvedValueOnce([
        { affiliateId: 'aff_1', _max: { paidAt: new Date('2026-08-10T00:00:00.000Z') } },
      ]);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: { id: string; amountOwed: number; lastPaidAt: string | null }[];
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.amountOwed).toBe(4500);
    expect(body.items[0]?.lastPaidAt).not.toBeNull();
  });

  it('propagates 403 from requireSuperadmin', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });
});
