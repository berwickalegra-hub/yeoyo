import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';

vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { POST, DELETE } from './route';

const mockCsrf = vi.mocked(verifyCsrf);
const mockAuth = vi.mocked(requireAuth);

beforeEach(() => {
  vi.clearAllMocks();
  mockCsrf.mockReturnValue(null);
  mockAuth.mockResolvedValue({ user: { sub: 'u1', email: 'u1@test.local' } } as never);
});

function post(body: unknown) {
  return new NextRequest('http://test/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'user-agent': 'jsdom' },
  });
}
function del(body: unknown) {
  return new NextRequest('http://test/api/push/subscribe', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/push/subscribe', () => {
  it('rejects when CSRF fails', async () => {
    mockCsrf.mockReturnValueOnce(NextResponse.json({ error: 'CSRF' }, { status: 403 }));
    expect((await POST(post({}))).status).toBe(403);
  });

  it('400s on a malformed body', async () => {
    expect((await POST(post({ endpoint: 'e' }))).status).toBe(400);
  });

  it('upserts the subscription keyed on endpoint', async () => {
    prismaMock.pushSubscription.upsert.mockResolvedValueOnce({ id: 's1' } as never);
    const res = await POST(post({ endpoint: 'https://push/e1', keys: { p256dh: 'a', auth: 'b' } }));
    expect(res.status).toBe(201);
    expect(prismaMock.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { endpoint: 'https://push/e1' } }),
    );
  });
});

describe('DELETE /api/push/subscribe', () => {
  it('deletes only rows owned by the caller', async () => {
    prismaMock.pushSubscription.deleteMany.mockResolvedValueOnce({ count: 1 } as never);
    const res = await DELETE(del({ endpoint: 'https://push/e1' }));
    expect(res.status).toBe(200);
    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://push/e1', userId: 'u1' },
    });
  });
});
