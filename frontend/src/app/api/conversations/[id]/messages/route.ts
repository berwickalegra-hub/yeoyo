// GET/POST /api/conversations/[id]/messages — the Messages thread view.
// GET returns a page of messages (oldest-first) and marks the other side's
// messages as read as a side effect (the caller is, by definition, viewing
// them now). POST persists a new message, bumps Conversation.lastMessageAt,
// fires a MESSAGE_RECEIVED notification, and — if ABLY_API_KEY is configured
// — publishes to the `conversation:{id}` Ably channel so the recipient's
// open thread updates without polling (see /api/realtime/token).
//
// Image attachments (2026-08-10, user-driven): a message is text, an image,
// or both (image + caption) — never neither. `imageUploadId` follows the
// same ownership-check pattern as POST /api/profile/photos (upload via
// /api/upload first, then reference the resulting FileUpload id here).
export const runtime = 'nodejs';

import 'server-only';
import Ably from 'ably';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { createLogger } from '@/lib/server/logger';
import { createNotification } from '@/lib/server/notifications';
import { messageReceived } from '@/lib/server/notifications/templates';
import { isChannelEnabled, parsePrefs } from '@/lib/server/notifications/prefs-merge';
import { isParticipant, otherParticipant } from '@/lib/server/conversations/lib';
import { isBlockedEitherWay } from '@/lib/server/blocks';
import { cloudinaryUrlForKey } from '@/lib/server/storage';

const log = createLogger();

const PAGE_SIZE = 30;
const Query = z.object({ before: z.string().datetime().optional() });
const Body = z
  .object({
    body: z.string().trim().max(2000).optional(),
    imageUploadId: z.string().optional(),
  })
  .refine((b) => !!b.body || !!b.imageUploadId, 'body or imageUploadId required');

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await routeCtx.params;
    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation || !isParticipant(conversation, auth.user.sub)) {
      return NextResponse.json(
        { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'Invalid query params' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const messages = await prisma.message.findMany({
      where: {
        conversationId: id,
        ...(parsed.data.before ? { createdAt: { lt: new Date(parsed.data.before) } } : {}),
      },
      include: { imageUpload: { select: { key: true } } },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
    });

    await prisma.message.updateMany({
      where: { conversationId: id, senderId: { not: auth.user.sub }, readAt: null },
      data: { readAt: new Date() },
    });

    return NextResponse.json(
      {
        messages: messages.reverse().map((m) => ({
          id: m.id,
          senderId: m.senderId,
          body: m.body,
          imageUrl: m.imageUpload ? cloudinaryUrlForKey(m.imageUpload.key) : null,
          createdAt: m.createdAt.toISOString(),
          fromSelf: m.senderId === auth.user.sub,
        })),
        hasMore: messages.length === PAGE_SIZE,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await routeCtx.params;
    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation || !isParticipant(conversation, auth.user.sub)) {
      return NextResponse.json(
        { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const recipientId = otherParticipant(conversation, auth.user.sub);
    if (await isBlockedEitherWay(auth.user.sub, recipientId)) {
      return NextResponse.json(
        { code: 'USER_BLOCKED', message: 'You cannot message this user' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'body or imageUploadId required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (parsed.data.imageUploadId) {
      const upload = await prisma.fileUpload.findFirst({
        where: { id: parsed.data.imageUploadId, userId: auth.user.sub },
      });
      if (!upload) {
        return NextResponse.json(
          { code: 'PHOTO_NOT_FOUND', message: 'imageUploadId does not belong to this user' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const now = new Date();
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: id,
          senderId: auth.user.sub,
          body: parsed.data.body ?? '',
          ...(parsed.data.imageUploadId ? { imageUploadId: parsed.data.imageUploadId } : {}),
        },
        include: { imageUpload: { select: { key: true } } },
      });
      await tx.conversation.update({ where: { id }, data: { lastMessageAt: now } });
      return created;
    });
    const imageUrl = message.imageUpload ? cloudinaryUrlForKey(message.imageUpload.key) : null;

    const [senderProfile, recipientPrefsRow] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: auth.user.sub }, select: { firstName: true } }),
      prisma.notificationPreferences.findUnique({
        where: { userId: recipientId },
        select: { prefs: true },
      }),
    ]);
    if (isChannelEnabled(parsePrefs(recipientPrefsRow?.prefs), 'MESSAGE_RECEIVED', 'inApp')) {
      await createNotification(
        prisma,
        messageReceived(
          recipientId,
          id,
          message.id,
          senderProfile?.firstName ?? 'Quelqu’un',
          message.body || '📷 Photo',
        ),
      );
    }

    if (process.env.ABLY_API_KEY) {
      try {
        const client = new Ably.Rest(process.env.ABLY_API_KEY);
        await client.channels.get(`conversation:${id}`).publish('message', {
          id: message.id,
          senderId: message.senderId,
          body: message.body,
          imageUrl,
          createdAt: message.createdAt.toISOString(),
        });
      } catch (err) {
        log.warn('Ably publish failed for conversation message', {
          error: err,
          conversationId: id,
        });
      }
    }

    return NextResponse.json(
      {
        id: message.id,
        senderId: message.senderId,
        body: message.body,
        imageUrl,
        createdAt: message.createdAt.toISOString(),
        fromSelf: true,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
