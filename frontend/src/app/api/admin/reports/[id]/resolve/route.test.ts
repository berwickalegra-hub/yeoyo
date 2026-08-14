// POST /api/admin/reports/[id]/resolve — resolve (action taken) or dismiss
// (no action) a report. Gated at MODERATOR (not just ADMIN) per the Task 3
// access widening.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn(),
}));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { POST } from './route';
import { seedAdmin, seedModerator } from '@/test-utils/admin-fixtures';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockLogAdminAction = vi.mocked(logAdminAction);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};

function makePost(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/admin/reports/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function seedReport(overrides: Partial<{ id: string; status: string }> = {}) {
  return {
    id: overrides.id ?? 'report_1',
    reporterId: 'user_reporter',
    targetId: 'user_target',
    reason: 'HARASSMENT',
    details: null,
    status: overrides.status ?? 'PENDING',
    resolvedAt: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockLogAdminAction.mockResolvedValue(undefined as never);
});

describe('/api/admin/reports/[id]/resolve', () => {
  it('POST resolves a pending report and logs the admin action', async () => {
    const report = seedReport({ id: 'r1' });
    prismaMock.report.findUnique.mockResolvedValueOnce(report as never);
    prismaMock.report.update.mockResolvedValueOnce({
      ...report,
      status: 'RESOLVED',
      resolvedAt: new Date(),
    } as never);

    const res = await POST(makePost('r1', { action: 'RESOLVE' }), ctxWith('r1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { status: string } };
    expect(body.report.status).toBe('RESOLVED');
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'report.resolve', targetType: 'Report', targetId: 'r1' }),
    );
  });

  it('POST dismisses a pending report', async () => {
    const report = seedReport({ id: 'r2' });
    prismaMock.report.findUnique.mockResolvedValueOnce(report as never);
    prismaMock.report.update.mockResolvedValueOnce({
      ...report,
      status: 'DISMISSED',
      resolvedAt: new Date(),
    } as never);

    const res = await POST(makePost('r2', { action: 'DISMISS' }), ctxWith('r2'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { status: string } };
    expect(body.report.status).toBe('DISMISSED');
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'report.dismiss', targetType: 'Report', targetId: 'r2' }),
    );
  });

  it('POST returns 404 REPORT_NOT_FOUND for a missing report', async () => {
    prismaMock.report.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost('missing', { action: 'RESOLVE' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('REPORT_NOT_FOUND');
  });

  it('POST is idempotent on an already-resolved report (no AdminAction write)', async () => {
    const report = seedReport({ id: 'r3', status: 'RESOLVED' });
    prismaMock.report.findUnique.mockResolvedValueOnce(report as never);
    const res = await POST(makePost('r3', { action: 'RESOLVE' }), ctxWith('r3'));
    expect(res.status).toBe(200);
    expect(prismaMock.report.update).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('POST returns 400 VALIDATION_FAILED for an invalid action', async () => {
    const res = await POST(makePost('r1', { action: 'BOGUS' }), ctxWith('r1'));
    expect(res.status).toBe(400);
    expect(prismaMock.report.findUnique).not.toHaveBeenCalled();
  });

  it('POST allows MODERATOR (not just ADMIN)', async () => {
    const moderator = seedModerator();
    mockRequireAdmin.mockResolvedValueOnce({
      user: { sub: moderator.id, email: moderator.email },
      admin: { id: moderator.id, email: moderator.email, role: 'MODERATOR' as const },
    });
    const report = seedReport({ id: 'r4' });
    prismaMock.report.findUnique.mockResolvedValueOnce(report as never);
    prismaMock.report.update.mockResolvedValueOnce({ ...report, status: 'RESOLVED' } as never);
    const res = await POST(makePost('r4', { action: 'RESOLVE' }), ctxWith('r4'));
    expect(res.status).toBe(200);
  });

  it('POST propagates CSRF failure before touching Prisma', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_FAILED' }, { status: 403 }),
    );
    const res = await POST(makePost('r1', { action: 'RESOLVE' }), ctxWith('r1'));
    expect(res.status).toBe(403);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
    expect(prismaMock.report.findUnique).not.toHaveBeenCalled();
  });

  it('POST propagates 403 from requireAdmin (below MODERATOR)', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost('r1', { action: 'RESOLVE' }), ctxWith('r1'));
    expect(res.status).toBe(403);
    expect(prismaMock.report.findUnique).not.toHaveBeenCalled();
  });
});
