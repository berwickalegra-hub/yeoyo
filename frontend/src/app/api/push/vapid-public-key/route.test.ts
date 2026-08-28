import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockAuth = vi.mocked(requireAuth);
const ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ENV };
  mockAuth.mockResolvedValue({ user: { sub: 'u1', email: 'u1@test.local' } } as never);
});

function req() {
  return new NextRequest('http://test/api/push/vapid-public-key');
}

describe('GET /api/push/vapid-public-key', () => {
  it('401s when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await GET(req())).status).toBe(401);
  });

  it('returns the key when configured', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    process.env.VAPID_SUBJECT = 'mailto:x@y.z';
    const body = await (await GET(req())).json();
    expect(body.publicKey).toBe('pub');
  });

  it('returns null when not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const body = await (await GET(req())).json();
    expect(body.publicKey).toBeNull();
  });
});
