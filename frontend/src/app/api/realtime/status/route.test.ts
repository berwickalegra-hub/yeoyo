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
  return new NextRequest('http://test/api/realtime/status');
}

describe('GET /api/realtime/status', () => {
  it('401s when unauthenticated', async () => {
    mockAuth.mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await GET(req())).status).toBe(401);
  });

  it('returns configured: true and a 200 when ABLY_API_KEY is set', async () => {
    process.env.ABLY_API_KEY = 'test-key';
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { configured: boolean };
    expect(body.configured).toBe(true);
  });

  it('returns configured: false and a 200 (never 503) when unset', async () => {
    delete process.env.ABLY_API_KEY;
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { configured: boolean };
    expect(body.configured).toBe(false);
  });
});
