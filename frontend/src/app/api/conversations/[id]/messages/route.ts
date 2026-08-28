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
import { sendPushToUser } from '@/lib/server/push';
import { messageReceived } from '@/lib/server/notifications/templates';
import { isChannelEnabled, parsePrefs } from '@/lib/server/notifications/prefs-merge';
import { isParticipant, otherParticipant, isMutedBy } from '@/lib/server/conversations/lib';
import { isBlockedEitherWay } from '@/lib/server/blocks';
import { cloudinaryUrlForKey } from '@/lib/server/storage';
import { spendCredits, CREDIT_COSTS } from '@/lib/server/credits/ledger';

const log = createLogger();

const PAGE_SIZE = 30;

/**
 * 2026-08-25 — "envoyer le premier message après une demande de contact
 * acceptée : 1 crédit, hommes uniquement" (explicit product spec). Free for
 * everyone else: replying, and any message once the conversation already
 * has at least one message, is always free regardless of sender.
 */
async function computeFirstMessageCost(conversationId: string, senderId: string): Promise<number> {
  const [messageCount, sender] = await Promise.all([
    prisma.message.count({ where: { conversationId } }),
    prisma.user.findUnique({
      where: { id: senderId },
      select: { role: true, profile: { select: { gender: true } } },
    }),
  ]);
  const isStaff = sender?.role === 'ADMIN' || sender?.role === 'SUPERADMIN';
  const isFirstMessage = messageCount === 0;
  const isMan = sender?.profile?.gender === 'HOMME';
  return isFirstMessage && isMan && !isStaff ? CREDIT_COSTS.first_message : 0;
}

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

    const now = new Date();
    const { count: markedReadCount } = await prisma.message.updateMany({
      where: { conversationId: id, senderId: { not: auth.user.sub }, readAt: null },
      data: { readAt: now },
    });

    // Only fetching the first page (no `before` cursor) reflects "the
    // caller just opened the thread" — publishing a read receipt while
    // scrolling up through old history would be misleading (nothing new
    // was actually seen just now, it was already read on first open).
    if (markedReadCount > 0 && !parsed.data.before && process.env.ABLY_API_KEY) {
      try {
        const client = new Ably.Rest(process.env.ABLY_API_KEY);
        await client.channels
          .get(`conversation:${id}`)
          .publish('read', { readerId: auth.user.sub, readAt: now.toISOString() });
      } catch (err) {
        log.warn('Ably publish failed for read receipt', { error: err, conversationId: id });
      }
    }

    const firstMessageCost = await computeFirstMessageCost(id, auth.user.sub);

    return NextResponse.json(
      {
        messages: messages.reverse().map((m) => ({
          id: m.id,
          senderId: m.senderId,
          body: m.deletedAt ? '' : m.body,
          imageUrl: m.deletedAt
            ? null
            : m.imageUpload
              ? cloudinaryUrlForKey(m.imageUpload.key)
              : null,
          createdAt: m.createdAt.toISOString(),
          readAt: m.readAt ? m.readAt.toISOString() : null,
          deleted: !!m.deletedAt,
          fromSelf: m.senderId === auth.user.sub,
        })),
        hasMore: messages.length === PAGE_SIZE,
        firstMessageCost,
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
    // The first-message credit spend and the message insert must succeed or
    // fail together — checking "is this the first message" outside the
    // transaction would race two rapid double-submits into both seeing an
    // empty conversation and only one actually being free.
    const result = await prisma.$transaction(async (tx) => {
      const [messageCount, sender] = await Promise.all([
        tx.message.count({ where: { conversationId: id } }),
        tx.user.findUnique({
          where: { id: auth.user.sub },
          select: { role: true, profile: { select: { gender: true } } },
        }),
      ]);
      const isStaff = sender?.role === 'ADMIN' || sender?.role === 'SUPERADMIN';
      const requiresCredit = messageCount === 0 && sender?.profile?.gender === 'HOMME' && !isStaff;

      if (requiresCredit) {
        const spend = await spendCredits(tx, {
          userId: auth.user.sub,
          action: 'first_message',
          role: sender?.role,
        });
        if (!spend.ok) {
          return { ok: false as const, balance: spend.balance };
        }
      }

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
      return { ok: true as const, message: created };
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          code: 'INSUFFICIENT_CREDITS',
          message: 'Solde de crédits insuffisant pour envoyer ce premier message.',
          balance: result.balance,
          cost: CREDIT_COSTS.first_message,
        },
        { status: 402, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const message = result.message;
    const imageUrl = message.imageUpload ? cloudinaryUrlForKey(message.imageUpload.key) : null;

    const [senderProfile, recipientPrefsRow] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: auth.user.sub }, select: { firstName: true } }),
      prisma.notificationPreferences.findUnique({
        where: { userId: recipientId },
        select: { prefs: true },
      }),
    ]);
    if (
      !isMutedBy(conversation, recipientId) &&
      isChannelEnabled(parsePrefs(recipientPrefsRow?.prefs), 'MESSAGE_RECEIVED', 'inApp')
    ) {
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

    if (
      !isMutedBy(conversation, recipientId) &&
      isChannelEnabled(parsePrefs(recipientPrefsRow?.prefs), 'MESSAGE_RECEIVED', 'push')
    ) {
      void sendPushToUser(prisma, recipientId, {
        title: `Nouveau message de ${senderProfile?.firstName ?? 'Quelqu’un'}`,
        body: (message.body || '📷 Photo').slice(0, 140),
        url: `/app/messages/${id}`,
        tag: `msg:${id}`,
      });
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
        readAt: null,
        deleted: false,
        fromSelf: true,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
