import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
});

import { requireSuperadmin } from '@/lib/server/middleware';
import { GET, POST } from './route';
import { seedSuperadmin, seedAdminInvite } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);

function makeGet(url = 'http://test/api/admin/invites'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}
function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/invites', {
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
});

describe('GET /api/admin/invites', () => {
  it('returns 200 with a paginated list', async () => {
    prismaMock.adminInvite.findMany.mockResolvedValueOnce([seedAdminInvite()] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it('propagates 403 from requireSuperadmin', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/invites', () => {
  it('creates an invite and enqueues the email, returns 201', async () => {
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.adminInvite.create.mockResolvedValueOnce(
      seedAdminInvite({ email: 'new-mod@test.local', role: 'MODERATOR' }) as never,
    );
    prismaMock.outboxEvent.create.mockResolvedValueOnce({ id: 'outbox_1' } as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ email: 'new-mod@test.local', role: 'MODERATOR' }));
    expect(res.status).toBe(201);
    expect(prismaMock.adminInvite.create).toHaveBeenCalled();
    expect(prismaMock.outboxEvent.create).toHaveBeenCalled();
  });

  it('rejects an invalid role', async () => {
    const res = await POST(makePost({ email: 'x@test.local', role: 'OWNER' }));
    expect(res.status).toBe(400);
  });
});
