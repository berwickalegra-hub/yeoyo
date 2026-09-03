// POST /api/admin/users/[id]/verification — manual VERIFY / UNVERIFY.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/server/notifications', () => ({ createNotification: vi.fn() }));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { createNotification } from '@/lib/server/notifications';
import { POST } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockLog = vi.mocked(logAdminAction);
const mockNotify = vi.mocked(createNotification);

const admin = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: admin.id, email: admin.email },
  admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
};

function makePost(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/admin/users/${id}/verification`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
const ctxWith = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockLog.mockResolvedValue(undefined as never);
  mockNotify.mockResolvedValue(undefined as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(undefined);
  });
});

describe('POST /api/admin/users/[id]/verification', () => {
  it('VERIFY sets VERIFIED + verifiedAt, clears request fields, audits, notifies', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({
      id: 'p1',
      verificationStatus: 'UNVERIFIED',
      verifiedAt: null,
    } as never);
    prismaMock.profile.update.mockResolvedValueOnce({} as never);

    const res = await POST(makePost('u1', { action: 'VERIFY' }), ctxWith('u1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verification: { status: string; noop: boolean } };
    expect(body.verification.status).toBe('VERIFIED');
    expect(body.verification.noop).toBe(false);

    const data = prismaMock.profile.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(data.data.verificationStatus).toBe('VERIFIED');
    expect(data.data.verifiedAt).toBeInstanceOf(Date);
    expect(data.data.verificationSelfieKey).toBeNull();
    expect(data.data.verificationCode).toBeNull();
    expect(data.data.verificationSubmittedAt).toBeNull();
    expect(data.data.verificationRejectionReason).toBeNull();

    expect(mockLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'profile.verify_manual', targetId: 'p1' }),
    );
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it('VERIFY works from REJECTED and records the previous status', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u2' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({
      id: 'p2',
      verificationStatus: 'REJECTED',
      verifiedAt: null,
    } as never);
    prismaMock.profile.update.mockResolvedValueOnce({} as never);

    const res = await POST(makePost('u2', { action: 'VERIFY' }), ctxWith('u2'));
    expect(res.status).toBe(200);
    expect(mockLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'profile.verify_manual',
        metadata: { userId: 'u2', from: 'REJECTED' },
      }),
    );
  });

  it('UNVERIFY clears the badge and does NOT notify', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u3' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({
      id: 'p3',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
    } as never);
    prismaMock.profile.update.mockResolvedValueOnce({} as never);

    const res = await POST(makePost('u3', { action: 'UNVERIFY' }), ctxWith('u3'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verification: { status: string } };
    expect(body.verification.status).toBe('UNVERIFIED');

    const data = prismaMock.profile.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(data.data.verificationStatus).toBe('UNVERIFIED');
    expect(data.data.verifiedAt).toBeNull();
    expect(mockLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'profile.unverify' }),
    );
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('VERIFY on an already-verified profile is a no-op (no write, no audit, no notif)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u4' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce({
      id: 'p4',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date('2026-06-01T00:00:00Z'),
    } as never);

    const res = await POST(makePost('u4', { action: 'VERIFY' }), ctxWith('u4'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verification: { noop: boolean } };
    expect(body.verification.noop).toBe(true);
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('404 when the member has no profile', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u9' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost('u9', { action: 'VERIFY' }), ctxWith('u9'));
    expect(res.status).toBe(404);
  });

  it('rejects an invalid action', async () => {
    const res = await POST(makePost('u1', { action: 'MAYBE' }), ctxWith('u1'));
    expect(res.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('propagates 403 from requireAdmin', async () => {
    const { NextResponse } = await import('next/server');
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }) as never,
    );
    const res = await POST(makePost('u1', { action: 'VERIFY' }), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
