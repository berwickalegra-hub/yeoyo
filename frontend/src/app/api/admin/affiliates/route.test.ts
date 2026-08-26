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
import { POST } from './route';
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
