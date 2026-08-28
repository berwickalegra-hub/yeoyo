// GET/POST /api/support/messages — the end-user side of the support inbox
// (2026-08-29, replaces the Coach floating button). No quota, no credit
// cost; the only real gate is imageUploadId ownership.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { GET, POST } from './route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAuth = vi.mocked(requireAuth);

const authedCtx = { user: { sub: 'user_1', email: 'user@test.local' } };

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/support/messages', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function seedMessage(overrides: Partial<{ id: string; content: string }> = {}) {
  return {
    id: overrides.id ?? 'sm_1',
    userId: 'user_1',
    senderRole: 'USER' as const,
    senderId: 'user_1',
    content: overrides.content ?? 'Bonjour, j’ai un souci',
    imageUploadId: null,
    imageUpload: null,
    readByAdminAt: null,
    createdAt: new Date('2026-08-29T10:00:00.000Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue(authedCtx);
});

describe('GET /api/support/messages', () => {
  it('returns the caller own thread, chronological', async () => {
    prismaMock.supportMessage.findMany.mockResolvedValueOnce([seedMessage()] as never);

    const res = await GET(new NextRequest('http://test/api/support/messages'));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: { content: string }[] };
    expect(body.messages).toHaveLength(1);
    expect(prismaMock.supportMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1' } }),
    );
  });

  it('propagates 401 from requireAuth', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(new NextRequest('http://test/api/support/messages'));
    expect(res.status).toBe(401);
    expect(prismaMock.supportMessage.findMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/support/messages', () => {
  it('creates a USER-authored message with the caller as both userId and senderId', async () => {
    prismaMock.supportMessage.create.mockResolvedValueOnce(
      seedMessage({ content: 'Le bouton ne marche pas' }) as never,
    );

    const res = await POST(makePost({ content: 'Le bouton ne marche pas' }));

    expect(res.status).toBe(201);
    expect(prismaMock.supportMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_1',
          senderRole: 'USER',
          senderId: 'user_1',
          content: 'Le bouton ne marche pas',
        }),
      }),
    );
  });

  it('rejects an imageUploadId that does not belong to the caller', async () => {
    prismaMock.fileUpload.findFirst.mockResolvedValueOnce(null as never);

    const res = await POST(makePost({ imageUploadId: 'c'.repeat(24) }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('IMAGE_NOT_FOUND');
    expect(prismaMock.supportMessage.create).not.toHaveBeenCalled();
  });

  it('rejects a body with neither content nor imageUploadId', async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
    expect(prismaMock.supportMessage.create).not.toHaveBeenCalled();
  });

  it('propagates CSRF failure before touching Prisma', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_FAILED' }, { status: 403 }),
    );
    const res = await POST(makePost({ content: 'Hello' }));
    expect(res.status).toBe(403);
    expect(prismaMock.supportMessage.create).not.toHaveBeenCalled();
  });
});
