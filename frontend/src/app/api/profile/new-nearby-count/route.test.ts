import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'me-1', email: 'me@example.com' } };

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/profile/new-nearby-count', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
  prismaMock.profile.count.mockResolvedValue(0 as never);
});

describe('GET /api/profile/new-nearby-count', () => {
  it('Test 1: scopes the count to the caller own commune when set', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ commune: 'Gombe' } as never);
    prismaMock.profile.count.mockResolvedValue(4 as never);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ count: 4, scope: 'commune', commune: 'Gombe' });
    const args = prismaMock.profile.count.mock.calls[0]?.[0];
    expect(args?.where?.commune).toBe('Gombe');
  });

  it('Test 2: falls back to a city-wide count (no commune filter) when the caller has none set', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ commune: null } as never);
    prismaMock.profile.count.mockResolvedValue(11 as never);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(body).toEqual({ count: 11, scope: 'city', commune: null });
    const args = prismaMock.profile.count.mock.calls[0]?.[0];
    expect(args?.where?.commune).toBeUndefined();
  });

  it('Test 3: excludes the caller from their own count', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ commune: null } as never);

    await GET(makeGet());

    const args = prismaMock.profile.count.mock.calls[0]?.[0];
    expect(args?.where?.userId).toEqual({ not: 'me-1' });
  });

  it('Test 4: only counts profiles created within the last 7 days', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ commune: null } as never);
    const before = Date.now();

    await GET(makeGet());

    const args = prismaMock.profile.count.mock.calls[0]?.[0];
    const gte = (args?.where?.createdAt as { gte: Date } | undefined)?.gte;
    expect(gte).toBeInstanceOf(Date);
    const daysAgo = (before - gte!.getTime()) / (24 * 60 * 60 * 1000);
    expect(daysAgo).toBeGreaterThanOrEqual(6.99);
    expect(daysAgo).toBeLessThanOrEqual(7.01);
  });
});
