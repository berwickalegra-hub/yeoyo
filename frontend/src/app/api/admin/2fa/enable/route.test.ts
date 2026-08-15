import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

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
  __cookieStore.clear();
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
    prismaMock.user.update.mockResolvedValueOnce({
      id: superadmin.id,
      email: superadmin.email,
      tokenVersion: 1,
    } as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ code: '123456' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ twoFactorEnabled: true, tokenVersion: { increment: 1 } }),
      }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalled();
    // Fresh cookies for the CURRENT session, bumped tokenVersion + trusted
    // (this request just proved a TOTP code) — same Pitfall-9-style reissue
    // as change-password/route.ts, so OTHER pre-existing sessions (still
    // holding the old tokenVersion) get invalidated on their next request.
    expect(__cookieStore.has('app-token')).toBe(true);
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
