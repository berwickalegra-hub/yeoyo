// GET /api/profiles/explorer — paginated, filtered profile grid matching
// the Explorer screen's filter panel (âge / intention / religion / enfants).
// Defaults to `me.interestedIn` (HOMME | FEMME | TOUS, set at onboarding or
// in Paramètres); null/unset falls back to the opposite of the caller's own
// gender, same as before that preference existed. Accepts an explicit
// `gender` query param override since Explorer's own chip row exposes a
// Femmes/Hommes/Tous toggle independent of the stored preference.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { toProfileCard } from '@/lib/server/profile/card';
import { blockedUserIds } from '@/lib/server/blocks';

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;

const Query = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  gender: z.enum(['HOMME', 'FEMME']).optional(),
  commune: z.string().optional(),
  ageMin: z.coerce.number().int().min(18).optional(),
  ageMax: z.coerce.number().int().min(18).optional(),
  religion: z.string().optional(),
  intent: z.enum(['COURT_TERME', 'MOYEN_TERME', 'LONG_TERME']).optional(),
  childrenCount: z.enum(['0', '1', '2', '3+']).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const me = await prisma.profile.findUnique({ where: { userId: auth.user.sub } });
    if (!me) {
      return NextResponse.json(
        { code: 'PROFILE_REQUIRED', message: 'Complete onboarding first' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'Invalid query params', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const q = parsed.data;
    const oppositeGender = me.gender === 'HOMME' ? 'FEMME' : 'HOMME';
    // null/unset interestedIn = legacy default (opposite gender only).
    // "TOUS" = no gender restriction unless the caller passes an explicit
    // `gender` override via the filter panel.
    const defaultGender =
      me.interestedIn === 'TOUS' ? undefined : (me.interestedIn ?? oppositeGender);
    const blocked = await blockedUserIds(auth.user.sub);

    const where: Prisma.ProfileWhereInput = {
      userId: { notIn: [auth.user.sub, ...blocked] },
      ...(q.gender ? { gender: q.gender } : defaultGender ? { gender: defaultGender } : {}),
      visibilityPublic: true,
      onboardingCompletedAt: { not: null },
      ...(q.commune ? { commune: q.commune } : {}),
      ...(q.intent ? { intent: q.intent } : {}),
      ...(q.childrenCount ? { childrenCount: q.childrenCount } : {}),
      ...(q.religion ? { religion: { in: q.religion.split(',') } } : {}),
    };

    // Age filters operate on dateOfBirth (inverse of age), so an ageMin
    // bound means "born on/before" the corresponding date, and vice versa.
    if (q.ageMin !== undefined || q.ageMax !== undefined) {
      const now = new Date();
      where.dateOfBirth = {
        ...(q.ageMin !== undefined
          ? { lte: new Date(now.getFullYear() - q.ageMin, now.getMonth(), now.getDate()) }
          : {}),
        ...(q.ageMax !== undefined
          ? { gte: new Date(now.getFullYear() - q.ageMax - 1, now.getMonth(), now.getDate()) }
          : {}),
      };
    }

    const [total, profiles] = await Promise.all([
      prisma.profile.count({ where }),
      prisma.profile.findMany({
        where,
        include: { photos: { orderBy: { order: 'asc' }, include: { fileUpload: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    // "liked" lets grid/deck cards render a filled heart for profiles the
    // caller already liked in a previous session — explorer (unlike
    // discover) does not exclude already-liked profiles from the pool.
    const likedRows =
      profiles.length > 0
        ? await prisma.like.findMany({
            where: { likerId: auth.user.sub, likedId: { in: profiles.map((p) => p.userId) } },
            select: { likedId: true },
          })
        : [];
    const likedSet = new Set(likedRows.map((r) => r.likedId));

    return NextResponse.json(
      {
        profiles: profiles.map((p) => ({ ...toProfileCard(p), liked: likedSet.has(p.userId) })),
        page: q.page,
        pageSize: q.pageSize,
        total,
        hasMore: q.page * q.pageSize < total,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
