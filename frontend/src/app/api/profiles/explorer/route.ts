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
import { getPremiumUserIds } from '@/lib/server/subscriptions/premium-status';

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
    const [blocked, alreadyLiked] = await Promise.all([
      blockedUserIds(auth.user.sub),
      prisma.like.findMany({ where: { likerId: auth.user.sub }, select: { likedId: true } }),
    ]);
    const excluded = [auth.user.sub, ...blocked, ...alreadyLiked.map((l) => l.likedId)];

    const where: Prisma.ProfileWhereInput = {
      userId: { notIn: excluded },
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

    // Boosted profiles (Profile.boostedUntil in the future) float to the top
    // of page 1. `boostedIds` is resolved on every page (cheap — capped at
    // 3 ids) and excluded from the plain query on every page too, so a
    // boosted profile shown at the top of page 1 never reappears, and
    // page 2+'s skip/take math stays correct relative to the shrunk
    // "non-boosted" ordering rather than the original one.
    const now = new Date();
    const boostedIds = (
      await prisma.profile.findMany({
        where: { ...where, boostedUntil: { gt: now } },
        select: { userId: true },
        orderBy: { boostedUntil: 'desc' },
        take: 3,
      })
    ).map((p) => p.userId);
    const boostedProfiles =
      q.page === 1 && boostedIds.length > 0
        ? await prisma.profile.findMany({
            where: { userId: { in: boostedIds } },
            include: { photos: { orderBy: { order: 'asc' }, include: { fileUpload: true } } },
            orderBy: { boostedUntil: 'desc' },
          })
        : [];
    const restWhere: Prisma.ProfileWhereInput =
      boostedIds.length > 0 ? { ...where, userId: { notIn: [...excluded, ...boostedIds] } } : where;
    const restTake = q.pageSize - (q.page === 1 ? boostedProfiles.length : 0);
    const restSkip = q.page === 1 ? 0 : (q.page - 1) * q.pageSize - boostedIds.length;

    const [total, restProfiles] = await Promise.all([
      prisma.profile.count({ where }),
      prisma.profile.findMany({
        where: restWhere,
        include: { photos: { orderBy: { order: 'asc' }, include: { fileUpload: true } } },
        orderBy: { createdAt: 'desc' },
        skip: Math.max(0, restSkip),
        take: restTake,
      }),
    ]);
    const profiles = [...boostedProfiles, ...restProfiles];

    const [favoriteRows, premiumIds] = await Promise.all([
      prisma.favorite.findMany({
        where: { userId: auth.user.sub, targetId: { in: profiles.map((p) => p.userId) } },
        select: { targetId: true },
      }),
      getPremiumUserIds(
        prisma,
        profiles.map((p) => p.userId),
      ),
    ]);
    const favorited = new Set(favoriteRows.map((f) => f.targetId));

    return NextResponse.json(
      {
        // Already-liked profiles are excluded from `where` above, so every
        // card here is genuinely un-actioned — `liked` is always false.
        // Keeping the field (rather than dropping it) avoids a breaking
        // change to ProfileCard consumers that still read it.
        profiles: profiles.map((p) => ({
          ...toProfileCard(p),
          liked: false,
          favorited: favorited.has(p.userId),
          boosted: p.boostedUntil ? p.boostedUntil > now : false,
          isPremium: premiumIds.has(p.userId),
        })),
        page: q.page,
        pageSize: q.pageSize,
        total,
        hasMore: q.page * q.pageSize < total,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
