import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/admin/two-factor', () => ({
  verifyTotpCode: vi.fn(),
  verifyRecoveryCode: vi.fn(),
}));

import { verifyTotpCode, verifyRecoveryCode } from '@/lib/server/admin/two-factor';
import { POST } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockVerifyTotp = vi.mocked(verifyTotpCode);
const mockVerifyRecovery = vi.mocked(verifyRecoveryCode);

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/2fa/verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

/** Mocks a successful atomic claim (the `updateMany` guard-and-increment). */
function mockClaimSucceeds() {
  prismaMock.adminTwoFactorChallenge.updateMany.mockResolvedValueOnce({ count: 1 } as never);
}

/** Mocks a failed atomic claim (row not found / consumed / at the attempts cap). */
function mockClaimFails() {
  prismaMock.adminTwoFactorChallenge.updateMany.mockResolvedValueOnce({ count: 0 } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
});

describe('POST /api/admin/2fa/verify', () => {
  it('issues cookies on a valid TOTP code and consumes the challenge', async () => {
    const superadmin = seedSuperadmin({ twoFactorSecret: 'iv:tag:data', twoFactorEnabled: true });
    mockClaimSucceeds();
    prismaMock.adminTwoFactorChallenge.findUnique.mockResolvedValueOnce({
      id: 'challenge_1',
      userId: superadmin.id,
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 1,
      consumedAt: null,
      createdAt: new Date(),
      user: superadmin,
    } as never);
    mockVerifyTotp.mockReturnValueOnce(true);
    prismaMock.adminTwoFactorChallenge.update.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ challengeId: 'challenge_1', code: '123456' }));
    expect(res.status).toBe(200);
    expect(__cookieStore.has('app-token')).toBe(true);
    expect(prismaMock.adminTwoFactorChallenge.updateMany).toHaveBeenCalledWith({
      where: { id: 'challenge_1', consumedAt: null, attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });
    expect(prismaMock.adminTwoFactorChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'challenge_1' } }),
    );
  });

  it('falls back to a recovery code and persists the shortened list', async () => {
    const superadmin = seedSuperadmin({
      twoFactorSecret: 'iv:tag:data',
      twoFactorEnabled: true,
      twoFactorRecoveryCodes: ['hash1', 'hash2'],
    } as never);
    mockClaimSucceeds();
    prismaMock.adminTwoFactorChallenge.findUnique.mockResolvedValueOnce({
      id: 'challenge_1',
      userId: superadmin.id,
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 1,
      consumedAt: null,
      createdAt: new Date(),
      user: superadmin,
    } as never);
    mockVerifyTotp.mockReturnValueOnce(false);
    mockVerifyRecovery.mockResolvedValueOnce({ ok: true, remaining: ['hash2'] });
    prismaMock.adminTwoFactorChallenge.update.mockResolvedValueOnce({} as never);
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ challengeId: 'challenge_1', code: 'deadbeef01' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: superadmin.id },
        data: { twoFactorRecoveryCodes: ['hash2'] },
      }),
    );
  });

  it('rejects an expired challenge', async () => {
    mockClaimSucceeds();
    prismaMock.adminTwoFactorChallenge.findUnique.mockResolvedValueOnce({
      id: 'challenge_1',
      userId: 'u1',
      expiresAt: new Date(Date.now() - 1000),
      attempts: 1,
      consumedAt: null,
      createdAt: new Date(),
      user: seedSuperadmin(),
    } as never);

    const res = await POST(makePost({ challengeId: 'challenge_1', code: '123456' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('CHALLENGE_EXPIRED');
  });

  it('rejects a wrong code without issuing cookies', async () => {
    const superadmin = seedSuperadmin({ twoFactorSecret: 'iv:tag:data', twoFactorEnabled: true });
    mockClaimSucceeds();
    prismaMock.adminTwoFactorChallenge.findUnique.mockResolvedValueOnce({
      id: 'challenge_1',
      userId: superadmin.id,
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 1,
      consumedAt: null,
      createdAt: new Date(),
      user: superadmin,
    } as never);
    mockVerifyTotp.mockReturnValueOnce(false);
    mockVerifyRecovery.mockResolvedValueOnce({ ok: false, remaining: [] });

    const res = await POST(makePost({ challengeId: 'challenge_1', code: '000000' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_CODE');
    expect(__cookieStore.has('app-token')).toBe(false);
    // No separate increment call — the atomic claim's updateMany already
    // incremented `attempts`; a failed code check must not touch the row
    // again via `.update`.
    expect(prismaMock.adminTwoFactorChallenge.update).not.toHaveBeenCalled();
  });

  it('rejects with 429 TOO_MANY_ATTEMPTS once the atomic claim is exhausted, without issuing cookies', async () => {
    // The atomic updateMany guard (`attempts: { lt: 5 } `) fails to match —
    // this is the scenario a 6th concurrent/sequential guess hits after 5
    // prior attempts already landed.
    mockClaimFails();
    prismaMock.adminTwoFactorChallenge.findUnique.mockResolvedValueOnce({
      id: 'challenge_1',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 5,
      consumedAt: null,
      createdAt: new Date(),
    } as never);

    const res = await POST(makePost({ challengeId: 'challenge_1', code: '000000' }));
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('TOO_MANY_ATTEMPTS');
    expect(__cookieStore.has('app-token')).toBe(false);
    // Verification helpers must never run once the claim is exhausted.
    expect(mockVerifyTotp).not.toHaveBeenCalled();
    expect(mockVerifyRecovery).not.toHaveBeenCalled();
  });
});
