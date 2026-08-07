// GET /api/app/nav-counts — sidebar badge counts (pending received contact
// requests, total unread messages across all conversations). Phase A's
// Sidebar shipped with badgeCounts left undefined ("their backends land in
// Phase C/D"); this is that backend, now that both exist.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const [demandes, messages] = await Promise.all([
      prisma.contactRequest.count({ where: { targetId: auth.user.sub, status: 'PENDING' } }),
      prisma.message.count({
        where: {
          senderId: { not: auth.user.sub },
          readAt: null,
          conversation: { OR: [{ userAId: auth.user.sub }, { userBId: auth.user.sub }] },
        },
      }),
    ]);

    return NextResponse.json(
      { demandes, messages },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
