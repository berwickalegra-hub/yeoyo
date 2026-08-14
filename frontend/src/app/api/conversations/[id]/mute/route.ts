// PATCH /api/conversations/[id]/mute — toggle whether the caller gets
// MESSAGE_RECEIVED notifications for this conversation. Per-side only (see
// Conversation.mutedByUserA/B): muting never affects the other participant,
// never hides the conversation from the inbox, and never changes unread
// counts — it only suppresses the notification POST /messages would
// otherwise create for the muted side.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { isParticipant, mutedFieldFor, isMutedBy } from '@/lib/server/conversations/lib';

export async function PATCH(
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

    const field = mutedFieldFor(conversation, auth.user.sub);
    const nextMuted = !isMutedBy(conversation, auth.user.sub);
    await prisma.conversation.update({ where: { id }, data: { [field]: nextMuted } });

    return NextResponse.json(
      { muted: nextMuted },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
