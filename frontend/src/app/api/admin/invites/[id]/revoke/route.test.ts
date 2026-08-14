import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
});

import { requireSuperadmin } from '@/lib/server/middleware';
import { POST } from './route';
import { seedSuperadmin, seedAdminInvite } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);

function makePost(): NextRequest {
  return new NextRequest('http://test/api/admin/invites/invite_1/revoke', { method: 'POST' });
}
function ctxWith(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  const superadmin = seedSuperadmin();
  mockRequireSuperadmin.mockResolvedValue({
    user: { sub: superadmin.id, email: superadmin.email },
    admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
  });
});

describe('POST /api/admin/invites/[id]/revoke', () => {
  it('revokes a pending invite', async () => {
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(seedAdminInvite() as never);
    prismaMock.adminInvite.update.mockResolvedValueOnce({} as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost(), ctxWith('invite_1'));
    expect(res.status).toBe(200);
    expect(prismaMock.adminInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
    );
  });

  it('404s for an unknown invite', async () => {
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost(), ctxWith('missing'));
    expect(res.status).toBe(404);
  });
});
