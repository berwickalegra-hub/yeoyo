// POST/DELETE /api/users/[id]/block — block/unblock another user. Blocking
// hides both profiles from each other's Découverte/Explorer results (see
// blockedUserIds() used by those routes) and refuses new messages in either
// direction; existing conversation/message rows are kept for history.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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

    const { id: blockedId } = await routeCtx.params;
    if (blockedId === auth.user.sub) {
      return NextResponse.json(
        { code: 'CANNOT_BLOCK_SELF', message: 'Cannot block yourself' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.blockedUser.upsert({
      where: { blockerId_blockedId: { blockerId: auth.user.sub, blockedId } },
      create: { blockerId: auth.user.sub, blockedId },
      update: {},
    });

    return NextResponse.json(
      { blocked: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function DELETE(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id: blockedId } = await routeCtx.params;
    await prisma.blockedUser
      .delete({ where: { blockerId_blockedId: { blockerId: auth.user.sub, blockedId } } })
      .catch(() => null);

    return NextResponse.json(
      { blocked: false },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
