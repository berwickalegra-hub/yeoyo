// DELETE /api/conversations/[id]/messages/[messageId] — unsend a message.
// Soft-delete only (Message.deletedAt), own messages only, no time limit.
// Publishes a `delete` Ably event so the message disappears live in both
// open threads (see /api/conversations/[id]/messages's `message`/`read`
// events for the same pattern).
export const runtime = 'nodejs';

import 'server-only';
import Ably from 'ably';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { createLogger } from '@/lib/server/logger';
import { isParticipant } from '@/lib/server/conversations/lib';

const log = createLogger();

export async function DELETE(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string; messageId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id, messageId } = await routeCtx.params;
    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation || !isParticipant(conversation, auth.user.sub)) {
      return NextResponse.json(
        { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.conversationId !== id) {
      return NextResponse.json(
        { code: 'MESSAGE_NOT_FOUND', message: 'Message not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (message.senderId !== auth.user.sub) {
      return NextResponse.json(
        { code: 'FORBIDDEN', message: 'You can only delete your own messages' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (message.deletedAt) {
      return NextResponse.json(
        { id: messageId, deleted: true },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });

    if (process.env.ABLY_API_KEY) {
      try {
        const client = new Ably.Rest(process.env.ABLY_API_KEY);
        await client.channels.get(`conversation:${id}`).publish('delete', { id: messageId });
      } catch (err) {
        log.warn('Ably publish failed for message delete', { error: err, conversationId: id });
      }
    }

    return NextResponse.json(
      { id: messageId, deleted: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
