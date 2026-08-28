// POST /api/admin/support/[userId]/reply — an admin sends a message into an
// end user's support thread. Audited via logAdminAction (every back-office
// mutation must be, per CLAUDE.md) so "who answered this user, when" is
// always reconstructible.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { cloudinaryUrlForKey } from '@/lib/server/storage';
import { zCuid } from '@/lib/server/zod-helpers';

const Body = z
  .object({
    content: z.string().trim().max(2000).optional(),
    imageUploadId: zCuid.optional(),
  })
  .refine((b) => !!b.content || !!b.imageUploadId, 'content or imageUploadId required');

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('MODERATOR');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { userId } = await routeCtx.params;

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return NextResponse.json(
        { code: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'content or imageUploadId required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (parsed.data.imageUploadId) {
      const upload = await prisma.fileUpload.findFirst({
        where: { id: parsed.data.imageUploadId, userId: auth.admin.id },
      });
      if (!upload) {
        return NextResponse.json(
          { code: 'IMAGE_NOT_FOUND', message: 'imageUploadId does not belong to this admin' },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const created = await prisma.supportMessage.create({
      data: {
        userId,
        senderRole: 'ADMIN',
        senderId: auth.admin.id,
        content: parsed.data.content ?? '',
        ...(parsed.data.imageUploadId ? { imageUploadId: parsed.data.imageUploadId } : {}),
      },
      include: { imageUpload: { select: { key: true } } },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'support.reply',
      targetType: 'User',
      targetId: userId,
      metadata: { supportMessageId: created.id },
    });

    return NextResponse.json(
      {
        message: {
          id: created.id,
          senderRole: created.senderRole,
          senderId: created.senderId,
          content: created.content,
          imageUrl: created.imageUpload ? cloudinaryUrlForKey(created.imageUpload.key) : null,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
