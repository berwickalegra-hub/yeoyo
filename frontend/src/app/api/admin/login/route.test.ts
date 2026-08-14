import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth/lockout', () => ({
  isLockedOut: vi.fn().mockResolvedValue(false),
  recordFailure: vi.fn().mockResolvedValue({ count: 1, locked: false }),
  recordSuccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/redis', () => ({ getRedis: () => null }));

import { POST } from './route';
import { seedAdmin, seedSuperadmin } from '@/test-utils/admin-fixtures';
import bcrypt from 'bcryptjs';

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
});

describe('POST /api/admin/login', () => {
  it('rejects a non-admin USER with generic INVALID_CREDENTIALS (no role leak)', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 12);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'user@test.local',
      passwordHash,
      role: 'USER',
      status: 'ACTIVE',
      twoFactorEnabled: false,
      twoFactorSecret: null,
      tokenVersion: 0,
    } as never);

    const res = await POST(makePost({ email: 'user@test.local', password: 'correct-horse' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_CREDENTIALS');
  });

  it('issues cookies immediately for ADMIN with 2FA not applicable', async () => {
    const admin = seedAdmin({ passwordHash: await bcrypt.hash('correct-horse', 12) });
    prismaMock.user.findUnique.mockResolvedValueOnce(admin as never);

    const res = await POST(makePost({ email: admin.email, password: 'correct-horse' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; admin: { role: string } };
    expect(body.ok).toBe(true);
    expect(body.admin.role).toBe('ADMIN');
    expect(__cookieStore.has('app-token')).toBe(true);
  });

  it('returns twoFactorRequired for SUPERADMIN with 2FA enabled, without cookies', async () => {
    const superadmin = seedSuperadmin({
      passwordHash: await bcrypt.hash('correct-horse', 12),
      twoFactorEnabled: true,
      twoFactorSecret: 'iv:tag:data',
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(superadmin as never);
    prismaMock.adminTwoFactorChallenge.create.mockResolvedValueOnce({
      id: 'challenge_1',
      userId: superadmin.id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
    } as never);

    const res = await POST(makePost({ email: superadmin.email, password: 'correct-horse' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { twoFactorRequired: boolean; challengeId: string };
    expect(body.twoFactorRequired).toBe(true);
    expect(body.challengeId).toBe('challenge_1');
    expect(__cookieStore.has('app-token')).toBe(false);
  });

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    const admin = seedAdmin({ passwordHash: await bcrypt.hash('correct-horse', 12) });
    prismaMock.user.findUnique.mockResolvedValueOnce(admin as never);

    const res = await POST(makePost({ email: admin.email, password: 'wrong-password' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_CREDENTIALS');
  });
});
