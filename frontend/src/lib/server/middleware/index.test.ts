// PROTECTED: this test does NOT modify middleware/index.ts. The file is on
// the "Files Claude must NOT modify" list (CLAUDE.md). Any drift between
// this test and the source is the test's problem, not the source's (same
// convention as crypto.test.ts).
//
// Covers the requireAdmin() 2FA gate added alongside the admin-backoffice
// auth-foundation whole-branch review fix: a session must carry
// twoFactorVerified=true when the target account has twoFactorEnabled,
// regardless of how the caller reached this session (consumer login,
// OAuth, and password-recovery flows never set that claim — only
// /api/admin/login's no-challenge branch and a successful
// /api/admin/2fa/verify do). Uses the authHeader Bearer-token fallback
// path (same convention as auth/me/route.test.ts) rather than seeding
// next/headers cookies(), since requireAuth/requireAdmin are called
// directly here, not through a route + NextRequest.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return {
    ...actual,
    verifyToken: vi.fn(),
  };
});

import { verifyToken } from '@/lib/server/auth';
import { requireAdmin, requireAuth } from './index';

const BEARER = 'Bearer valid-access-token';

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
});

describe('requireAuth — twoFactorVerified propagation', () => {
  it('propagates twoFactorVerified: true from the token payload', async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'u1',
      email: 'a@b.com',
      twoFactorVerified: true,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    } as never);

    const auth = await requireAuth(BEARER);
    expect(auth).not.toBeInstanceOf(NextResponse);
    if (auth instanceof NextResponse) throw new Error('unreachable');
    expect(auth.twoFactorVerified).toBe(true);
  });

  it('defaults twoFactorVerified to false when the token payload omits it', async () => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    } as never);

    const auth = await requireAuth(BEARER);
    expect(auth).not.toBeInstanceOf(NextResponse);
    if (auth instanceof NextResponse) throw new Error('unreachable');
    expect(auth.twoFactorVerified).toBe(false);
  });
});

describe('requireAdmin — 2FA gate', () => {
  it('allows access when the account has no 2FA enabled, regardless of twoFactorVerified', async () => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com' });
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', tokenVersion: 0 } as never) // requireAuth's lookup
      .mockResolvedValueOnce({
        id: 'u1',
        email: 'a@b.com',
        role: 'SUPERADMIN',
        twoFactorEnabled: false,
      } as never); // requireAdmin's lookup

    const result = await requireAdmin('SUPERADMIN', BEARER);
    expect(result).not.toBeInstanceOf(NextResponse);
  });

  it('allows access when 2FA is enabled and this session already satisfied it', async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'u1',
      email: 'a@b.com',
      twoFactorVerified: true,
    });
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', tokenVersion: 0 } as never)
      .mockResolvedValueOnce({
        id: 'u1',
        email: 'a@b.com',
        role: 'SUPERADMIN',
        twoFactorEnabled: true,
      } as never);

    const result = await requireAdmin('SUPERADMIN', BEARER);
    expect(result).not.toBeInstanceOf(NextResponse);
  });

  it('rejects with 403 TWO_FACTOR_REQUIRED when 2FA is enabled but this session never proved it (the bypass this fix closes)', async () => {
    // Simulates a session minted by the consumer /api/auth/login or Google
    // OAuth callback — role is valid, but no twoFactorVerified claim.
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com' });
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', tokenVersion: 0 } as never)
      .mockResolvedValueOnce({
        id: 'u1',
        email: 'a@b.com',
        role: 'SUPERADMIN',
        twoFactorEnabled: true,
      } as never);

    const result = await requireAdmin('SUPERADMIN', BEARER);
    expect(result).toBeInstanceOf(NextResponse);
    if (!(result instanceof NextResponse)) throw new Error('unreachable');
    expect(result.status).toBe(403);
    const body = (await result.json()) as { error: string };
    expect(body.error).toBe('TWO_FACTOR_REQUIRED');
  });

  it('checks the 2FA gate against the target account, not the session, even if role rank alone would pass', async () => {
    // A MODERATOR-minimum route with a SUPERADMIN-2FA-enabled caller still
    // must pass the 2FA gate — role sufficiency and 2FA satisfaction are
    // independent checks.
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'u1', email: 'a@b.com' });
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', tokenVersion: 0 } as never)
      .mockResolvedValueOnce({
        id: 'u1',
        email: 'a@b.com',
        role: 'SUPERADMIN',
        twoFactorEnabled: true,
      } as never);

    const result = await requireAdmin('MODERATOR', BEARER);
    expect(result).toBeInstanceOf(NextResponse);
    if (!(result instanceof NextResponse)) throw new Error('unreachable');
    expect(result.status).toBe(403);
    const body = (await result.json()) as { error: string };
    expect(body.error).toBe('TWO_FACTOR_REQUIRED');
  });
});
