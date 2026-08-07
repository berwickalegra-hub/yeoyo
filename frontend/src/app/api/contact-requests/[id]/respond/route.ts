// POST /api/contact-requests/[id]/respond — the target accepts or declines
// a PENDING contact request. Accepting creates the Conversation row (see
// conversations/lib.ts:orderedPair) in the same transaction as the status
// flip, so a request can never end up ACCEPTED without a conversation.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { orderedPair } from '@/lib/server/conversations/lib';

const Body = z.object({ action: z.enum(['ACCEPT', 'DECLINE']) });

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
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'action must be ACCEPT or DECLINE' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const request = await prisma.contactRequest.findUnique({ where: { id } });
    if (!request || request.targetId !== auth.user.sub) {
      return NextResponse.json(
        { code: 'CONTACT_REQUEST_NOT_FOUND', message: 'Contact request not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (request.status === 'ACCEPTED' || request.status === 'CANCELLED') {
      return NextResponse.json(
        { code: 'CONTACT_REQUEST_ALREADY_RESOLVED', message: 'This request was already resolved' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (parsed.data.action === 'DECLINE') {
      const updated = await prisma.contactRequest.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
      return NextResponse.json(
        { status: updated.status, conversationId: null },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { userAId, userBId } = orderedPair(request.requesterId, request.targetId);
    const { conversationId } = await prisma.$transaction(async (tx) => {
      await tx.contactRequest.update({ where: { id }, data: { status: 'ACCEPTED' } });
      const conversation = await tx.conversation.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        create: { userAId, userBId, contactRequestId: id },
        update: {},
      });
      return { conversationId: conversation.id };
    });

    return NextResponse.json(
      { status: 'ACCEPTED', conversationId },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
