import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

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
  return new NextRequest('http://test/api/admin/2fa/disable', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
});

describe('POST /api/admin/2fa/disable', () => {
  it('disables 2FA when password and code are both valid', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 12);
    const superadmin = seedSuperadmin({ passwordHash, twoFactorSecret: 'iv:tag:data' });
    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(superadmin as never);
    mockVerifyTotp.mockReturnValueOnce(true);
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ password: 'correct-horse', code: '123456' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: null },
      }),
    );
  });

  it('rejects a wrong password without disabling', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 12);
    const superadmin = seedSuperadmin({ passwordHash, twoFactorSecret: 'iv:tag:data' });
    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(superadmin as never);

    const res = await POST(makePost({ password: 'wrong', code: '123456' }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
