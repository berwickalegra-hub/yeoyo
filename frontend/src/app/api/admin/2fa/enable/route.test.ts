import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
});
vi.mock('@/lib/server/admin/two-factor', () => ({ verifyTotpCode: vi.fn() }));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyTotpCode } from '@/lib/server/admin/two-factor';
import { POST } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyTotp = vi.mocked(verifyTotpCode);

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/2fa/enable', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
});

describe('POST /api/admin/2fa/enable', () => {
  it('enables 2FA when the confirmation code is valid', async () => {
    const superadmin = seedSuperadmin({ twoFactorSecret: 'iv:tag:data' });
    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(superadmin as never);
    mockVerifyTotp.mockReturnValueOnce(true);
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ code: '123456' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { twoFactorEnabled: true } }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalled();
  });

  it('rejects an invalid confirmation code and does not enable', async () => {
    const superadmin = seedSuperadmin({ twoFactorSecret: 'iv:tag:data' });
    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(superadmin as never);
    mockVerifyTotp.mockReturnValueOnce(false);

    const res = await POST(makePost({ code: '000000' }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
