import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
});

import { requireSuperadmin } from '@/lib/server/middleware';
import { POST } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);

function makePost(): NextRequest {
  return new NextRequest('http://test/api/admin/2fa/setup', { method: 'POST' });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/admin/2fa/setup', () => {
  it('returns a QR data URI, otpauth URI, and 10 recovery codes; stores the secret unenabled', async () => {
    const superadmin = seedSuperadmin();
    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.update.mockResolvedValueOnce({} as never);

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
  });

  it('propagates 403 from requireSuperadmin', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost());
    expect(res.status).toBe(403);
  });
});
