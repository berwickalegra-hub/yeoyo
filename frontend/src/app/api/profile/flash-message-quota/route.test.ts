// FLASH-01 — POST /api/profile/flash-message-quota tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

function makePost(opts: { csrf?: 'match' | 'missing' } = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = {};
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return new NextRequest('http://test/api/profile/flash-message-quota', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  mockRequireAuth.mockResolvedValue(authedCtx);
});

describe('POST /api/profile/flash-message-quota', () => {
  it('Test 1: missing CSRF header → 403', async () => {
    const res = await POST(makePost({ csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(prismaMock.profile.updateMany).not.toHaveBeenCalled();
  });

  it('Test 2: requireAuth bail → 401, no quota lookups', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await POST(makePost());
    expect(res.status).toBe(401);
    expect(prismaMock.subscription.findFirst).not.toHaveBeenCalled();
  });

  it('Test 3: ACTIVE subscriber → allowed, remaining null, never touches the counter', async () => {
    prismaMock.subscription.findFirst.mockResolvedValue({ id: 'sub-1' } as never);
    const res = await POST(makePost());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ allowed: true, remaining: null });
    expect(prismaMock.profile.updateMany).not.toHaveBeenCalled();
  });

  it('Test 4: free user under the limit → allowed, remaining reflects usage', async () => {
    prismaMock.subscription.findFirst.mockResolvedValue(null);
    prismaMock.profile.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.profile.findUnique.mockResolvedValue({ flashMessagesUsed: 2 } as never);

    const res = await POST(makePost());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ allowed: true, remaining: 1 });

    const args = prismaMock.profile.updateMany.mock.calls[0]?.[0];
    expect(args?.where?.userId).toBe('user-1');
    expect(args?.where?.flashMessagesUsed).toEqual({ lt: 3 });
    expect(args?.data?.flashMessagesUsed).toEqual({ increment: 1 });
  });

  it('Test 5: free user at/over the limit → updateMany matches nothing, allowed:false remaining:0', async () => {
    prismaMock.subscription.findFirst.mockResolvedValue(null);
    prismaMock.profile.updateMany.mockResolvedValue({ count: 0 } as never);

    const res = await POST(makePost());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ allowed: false, remaining: 0 });
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });
});

describe('source invariants', () => {
  it("route source contains runtime='nodejs', consumeFlashMessageQuota, verifyCsrf, withRequestContext", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toContain('consumeFlashMessageQuota');
    expect(src).toContain('verifyCsrf(req)');
    expect(src).toContain('withRequestContext');
  });
});
