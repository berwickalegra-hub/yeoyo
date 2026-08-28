// GET /api/admin/support/[userId] — full support thread for one end user,
// chronological. Opening a thread bulk-marks every USER-authored message as
// read (readByAdminAt = now) in the same call, same "mark read on open"
// convention as GET /api/conversations/[id]/messages — this is what clears
// the unread badge for this thread on the next /api/admin/support list load.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { cloudinaryUrlForKey } from '@/lib/server/storage';

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('MODERATOR');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { userId } = await routeCtx.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
    if (!user) {
      return NextResponse.json(
        { code: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const messages = await prisma.supportMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { imageUpload: { select: { key: true } } },
    });

    await prisma.supportMessage.updateMany({
      where: { userId, senderRole: 'USER', readByAdminAt: null },
      data: { readByAdminAt: new Date() },
    });

    return NextResponse.json(
      {
        user,
        messages: messages.map((m) => ({
          id: m.id,
          senderRole: m.senderRole,
          senderId: m.senderId,
          content: m.content,
          imageUrl: m.imageUpload ? cloudinaryUrlForKey(m.imageUpload.key) : null,
          createdAt: m.createdAt.toISOString(),
        })),
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
