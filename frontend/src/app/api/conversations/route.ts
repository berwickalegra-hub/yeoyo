// GET /api/conversations — the Messages inbox list: one row per conversation
// the caller participates in, with the other participant's card, the last
// message preview, and an unread count (messages from the other side with
// readAt still null).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { toProfileCard } from '@/lib/server/profile/card';
import { otherParticipant } from '@/lib/server/conversations/lib';

const profileInclude = {
  profile: {
    include: { photos: { where: { isPrimary: true }, take: 1, include: { fileUpload: true } } },
  },
} as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const selfId = auth.user.sub;

    const conversations = await prisma.conversation.findMany({
      where: { OR: [{ userAId: selfId }, { userBId: selfId }] },
      include: {
        userA: { include: profileInclude },
        userB: { include: profileInclude },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { imageUpload: { select: { key: true } } },
        },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    });

    const unreadCounts = conversations.length
      ? await prisma.message.groupBy({
          by: ['conversationId'],
          where: {
            conversationId: { in: conversations.map((c) => c.id) },
            senderId: { not: selfId },
            readAt: null,
          },
          _count: { id: true },
        })
      : [];
    const unreadByConversation = new Map(unreadCounts.map((u) => [u.conversationId, u._count.id]));

    const result = conversations
      .map((c) => {
        const otherId = otherParticipant(c, selfId);
        const other = c.userAId === otherId ? c.userA : c.userB;
        if (!other.profile) return null;
        const lastMessage = c.messages[0];
        return {
          id: c.id,
          otherUser: toProfileCard(other.profile),
          lastMessage: lastMessage
            ? {
                body: lastMessage.body,
                hasImage: !!lastMessage.imageUpload,
                createdAt: lastMessage.createdAt.toISOString(),
                fromSelf: lastMessage.senderId === selfId,
              }
            : null,
          unreadCount: unreadByConversation.get(c.id) ?? 0,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return NextResponse.json(
      { conversations: result },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
