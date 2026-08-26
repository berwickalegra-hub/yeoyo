// Focused on the AFFILIATE-role guard added to GET/POST/PATCH — an
// AFFILIATE-role account has no dating-app-facing identity and must never
// be able to read, create, or update a Profile (see rejectIfAffiliate in
// route.ts). Not a full behavioral test of every branch of this route.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
});

import { requireAuth } from '@/lib/server/middleware';
import { GET, POST, PATCH } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user_1', email: 'me@example.com' } };

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/profile');
}
function makePost(body: unknown = {}): NextRequest {
  return new NextRequest('http://test/api/profile', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}
function makePatch(body: unknown = { bio: 'hi' }): NextRequest {
  return new NextRequest('http://test/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(authedCtx);
});

describe('/api/profile — AFFILIATE-role guard', () => {
  it('GET rejects an AFFILIATE account with 403 AFFILIATE_ACCOUNT, no profile lookup', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'AFFILIATE' } as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('AFFILIATE_ACCOUNT');
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });

  it('POST rejects an AFFILIATE account with 403 AFFILIATE_ACCOUNT, never creates a Profile', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'AFFILIATE' } as never);

    const res = await POST(makePost());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('AFFILIATE_ACCOUNT');
    expect(prismaMock.profile.create).not.toHaveBeenCalled();
  });

  it('PATCH rejects an AFFILIATE account with 403 AFFILIATE_ACCOUNT, never updates a Profile', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'AFFILIATE' } as never);

    const res = await PATCH(makePatch());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('AFFILIATE_ACCOUNT');
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
  });

  it('GET passes a non-AFFILIATE (USER) role through to the normal profile lookup', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ role: 'USER' } as never);
    prismaMock.profile.findUnique.mockResolvedValueOnce(null);

    const res = await GET(makeGet());
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('PROFILE_NOT_FOUND');
  });
});
