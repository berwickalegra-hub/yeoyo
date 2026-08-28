// GET /api/support/messages — the caller's own support thread (chronological,
// last HISTORY_LIMIT messages). POST — send a message to the support inbox,
// optionally with a screenshot (upload via /api/upload first, then reference
// the resulting FileUpload id here — same ownership-check pattern as
// POST /api/conversations/[id]/messages's imageUploadId).
//
// No credit cost, no quota — unlike Coach (which this widget replaced on the
// client, 2026-08-29 explicit user ask), contacting support is always free.
// Replies come from an admin via POST /api/admin/support/[userId]/reply and
// show up here on the next GET (no push/real-time in v1, same as Coach).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { cloudinaryUrlForKey } from '@/lib/server/storage';
import { zCuid } from '@/lib/server/zod-helpers';

const HISTORY_LIMIT = 100;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const messages = await prisma.supportMessage.findMany({
      where: { userId: auth.user.sub },
      orderBy: { createdAt: 'asc' },
      take: HISTORY_LIMIT,
      include: { imageUpload: { select: { key: true } } },
    });

    return NextResponse.json(
      {
        messages: messages.map((m) => ({
          id: m.id,
          senderRole: m.senderRole,
          content: m.content,
          imageUrl: m.imageUpload ? cloudinaryUrlForKey(m.imageUpload.key) : null,
          createdAt: m.createdAt.toISOString(),
        })),
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const Body = z
  .object({
    content: z.string().trim().max(2000).optional(),
    imageUploadId: zCuid.optional(),
  })
  .refine((b) => !!b.content || !!b.imageUploadId, 'content or imageUploadId required');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'content or imageUploadId required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (parsed.data.imageUploadId) {
      const upload = await prisma.fileUpload.findFirst({
        where: { id: parsed.data.imageUploadId, userId: auth.user.sub },
      });
      if (!upload) {
        return NextResponse.json(
          { code: 'IMAGE_NOT_FOUND', message: 'imageUploadId does not belong to this user' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const created = await prisma.supportMessage.create({
      data: {
        userId: auth.user.sub,
        senderRole: 'USER',
        senderId: auth.user.sub,
        content: parsed.data.content ?? '',
        ...(parsed.data.imageUploadId ? { imageUploadId: parsed.data.imageUploadId } : {}),
      },
      include: { imageUpload: { select: { key: true } } },
    });

    return NextResponse.json(
      {
        message: {
          id: created.id,
          senderRole: created.senderRole,
          content: created.content,
          imageUrl: created.imageUpload ? cloudinaryUrlForKey(created.imageUpload.key) : null,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
