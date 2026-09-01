import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/affiliates/code', () => ({
  generateUniqueAffiliateCode: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { generateUniqueAffiliateCode } from '@/lib/server/affiliates/code';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGenerateCode = vi.mocked(generateUniqueAffiliateCode);

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/referral/me', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({
    user: { sub: 'user_1', email: 'user@test.local' },
  } as never);
});

describe('GET /api/referral/me', () => {
  it('returns the existing code and points without generating a new one', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      affiliateCode: 'EXISTING1',
      referralPoints: 40,
    } as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      affiliateCode: 'EXISTING1',
      referralPoints: 40,
      pointsPerCredit: 100,
      referralUrl: 'http://localhost:3000/onboarding?promo=EXISTING1',
    });
    expect(mockGenerateCode).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('lazily generates and persists a code on first call', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      affiliateCode: null,
      referralPoints: 0,
    } as never);
    mockGenerateCode.mockResolvedValueOnce('FRESHCODE');
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.affiliateCode).toBe('FRESHCODE');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { affiliateCode: 'FRESHCODE' },
    });
  });

  it('returns 404 USER_NOT_FOUND if the authenticated user no longer exists', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('USER_NOT_FOUND');
  });

  it('propagates a 401 from requireAuth without touching Prisma', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("source exports runtime = 'nodejs' (Phase 0 guard)", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
  });
});
