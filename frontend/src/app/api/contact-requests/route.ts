// GET /api/contact-requests?type=received|sent — the Demandes inbox. Liking
// a profile (POST /api/likes) auto-creates a PENDING row here; the target
// accepts/declines via POST /api/contact-requests/[id]/respond.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { toProfileCard } from '@/lib/server/profile/card';

const Query = z.object({ type: z.enum(['received', 'sent']).default('received') });

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'Invalid query params' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const rows = await prisma.contactRequest.findMany({
      where:
        parsed.data.type === 'received'
          ? { targetId: auth.user.sub }
          : { requesterId: auth.user.sub },
      include: {
        requester: {
          include: {
            profile: {
              include: {
                photos: { where: { isPrimary: true }, take: 1, include: { fileUpload: true } },
              },
            },
          },
        },
        target: {
          include: {
            profile: {
              include: {
                photos: { where: { isPrimary: true }, take: 1, include: { fileUpload: true } },
              },
            },
          },
        },
        conversation: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const requests = rows
      .map((row) => {
        const otherUser = parsed.data.type === 'received' ? row.requester : row.target;
        if (!otherUser.profile) return null;
        return {
          id: row.id,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          conversationId: row.conversation?.id ?? null,
          otherUser: toProfileCard(otherUser.profile),
          flashMessageBody:
            parsed.data.type === 'received' && row.status === 'PENDING'
              ? row.flashMessageBody
              : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return NextResponse.json(
      { requests },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
