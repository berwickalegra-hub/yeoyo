import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
});

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { POST } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

function makePost(body?: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/2fa/setup', {
    method: 'POST',
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
});

describe('POST /api/admin/2fa/setup', () => {
  it('returns a QR data URI, otpauth URI, and 10 recovery codes; stores the secret unenabled', async () => {
    const superadmin = seedSuperadmin();
    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      twoFactorEnabled: false,
      passwordHash: superadmin.passwordHash,
    } as never);
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      qrCodeDataUri: string;
      otpauthUri: string;
      recoveryCodes: string[];
    };
    expect(body.qrCodeDataUri).toMatch(/^data:image\/png;base64,/);
    expect(body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(body.recoveryCodes).toHaveLength(10);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: superadmin.id },
        data: expect.objectContaining({ twoFactorEnabled: false }),
      }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalled();
  });

  it('propagates 403 from requireSuperadmin', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost());
    expect(res.status).toBe(403);
  });

  it('rejects rotating an already-enabled 2FA setup without a correct password', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 12);
    const superadmin = seedSuperadmin({ passwordHash, twoFactorEnabled: true });
    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      twoFactorEnabled: true,
      passwordHash,
    } as never);

    // Missing password entirely.
    const resMissing = await POST(makePost());
    expect(resMissing.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();

    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      twoFactorEnabled: true,
      passwordHash,
    } as never);

    // Wrong password.
    const resWrong = await POST(makePost({ password: 'wrong' }));
    expect(resWrong.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('allows rotating an already-enabled 2FA setup with the correct password', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 12);
    const superadmin = seedSuperadmin({ passwordHash, twoFactorEnabled: true });
    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce({
      twoFactorEnabled: true,
      passwordHash,
    } as never);
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ password: 'correct-horse' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: superadmin.id },
        data: expect.objectContaining({ twoFactorEnabled: false }),
      }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'admin.2fa_setup_initiated' }),
      }),
    );
  });
});
