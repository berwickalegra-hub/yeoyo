// GET /api/likes/received — "Mes likes" screen: profiles that liked me.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { toProfileCard } from '@/lib/server/profile/card';
import { blockedUserIds } from '@/lib/server/blocks';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const blocked = await blockedUserIds(auth.user.sub);

    const [rows, likedBackIds] = await Promise.all([
      prisma.like.findMany({
        where: { likedId: auth.user.sub, likerId: { notIn: blocked } },
        include: {
          liker: {
            include: {
              profile: {
                include: {
                  photos: { where: { isPrimary: true }, take: 1, include: { fileUpload: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.like.findMany({ where: { likerId: auth.user.sub }, select: { likedId: true } }),
    ]);
    const likedBackSet = new Set(likedBackIds.map((l) => l.likedId));

    const likes = rows
      .filter((row) => row.liker.profile)
      .map((row) => ({
        likeId: row.id,
        createdAt: row.createdAt.toISOString(),
        likedBack: likedBackSet.has(row.likerId),
        profile: toProfileCard(row.liker.profile!),
      }));

    return NextResponse.json(
      { likes },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
