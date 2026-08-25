// GET /api/favorites — my favorited (bookmarked) profiles, most recent first.
// POST /api/favorites — favorite a profile (idempotent upsert).
// DELETE /api/favorites — unfavorite.
//
// A Favorite is a personal shortlist bookmark, distinct from Like (which
// auto-creates a ContactRequest). See prisma/schema.prisma's Favorite model
// comment. Unrelated to /app/likes ("Mes likes" = who liked me).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { toProfileCard } from '@/lib/server/profile/card';
import { isBlockedEitherWay } from '@/lib/server/blocks';

const Body = z.object({ targetUserId: z.string() });

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const favorites = await prisma.favorite.findMany({
      where: { userId: auth.user.sub },
      orderBy: { createdAt: 'desc' },
      include: {
        target: {
          include: {
            profile: {
              include: { photos: { orderBy: { order: 'asc' }, include: { fileUpload: true } } },
            },
          },
        },
      },
    });

    const eligible = favorites.filter(
      (f) => f.target.profile && f.target.profile.onboardingCompletedAt,
    );
    const rows = eligible.map((f) => ({
      favoriteId: f.id,
      createdAt: f.createdAt.toISOString(),
      profile: toProfileCard(f.target.profile!),
    }));

    return NextResponse.json(
      { favorites: rows },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'targetUserId is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { targetUserId } = parsed.data;

    if (targetUserId === auth.user.sub) {
      return NextResponse.json(
        { code: 'CANNOT_FAVORITE_SELF', message: 'Cannot favorite your own profile' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (await isBlockedEitherWay(auth.user.sub, targetUserId)) {
      return NextResponse.json(
        { code: 'PROFILE_NOT_FOUND', message: 'Target profile not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const favorite = await prisma.favorite.upsert({
      where: { userId_targetId: { userId: auth.user.sub, targetId: targetUserId } },
      create: { userId: auth.user.sub, targetId: targetUserId },
      update: {},
    });

    return NextResponse.json(
      { favoriteId: favorite.id },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'targetUserId is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const deleted = await prisma.favorite
      .delete({
        where: {
          userId_targetId: { userId: auth.user.sub, targetId: parsed.data.targetUserId },
        },
      })
      .catch(() => null);

    return NextResponse.json(
      { deleted: !!deleted },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
