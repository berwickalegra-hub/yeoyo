// GET /api/profiles/discover — the "Profil du jour" featured card + a
// compatibility breakdown (same commune / same religion / same intent),
// matching the Découverte Profils screen. Candidates exclude the caller,
// anyone already liked, and (v1 scope) are restricted to the opposite of
// the caller's own gender — the onboarding wizard only collects a binary
// HOMME/FEMME gender, so this is the only orientation model available.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { toProfileCard } from '@/lib/server/profile/card';
import { blockedUserIds } from '@/lib/server/blocks';

const CANDIDATE_POOL_SIZE = 20;

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

    const oppositeGender = me.gender === 'HOMME' ? 'FEMME' : 'HOMME';
    const [alreadyLiked, blocked] = await Promise.all([
      prisma.like.findMany({ where: { likerId: auth.user.sub }, select: { likedId: true } }),
      blockedUserIds(auth.user.sub),
    ]);
    const excludeIds = [auth.user.sub, ...alreadyLiked.map((l) => l.likedId), ...blocked];

    const candidates = await prisma.profile.findMany({
      where: {
        userId: { notIn: excludeIds },
        gender: oppositeGender,
        visibilityPublic: true,
        onboardingCompletedAt: { not: null },
      },
      include: { photos: { where: { isPrimary: true }, take: 1, include: { fileUpload: true } } },
      orderBy: { createdAt: 'desc' },
      take: CANDIDATE_POOL_SIZE,
    });

    if (candidates.length === 0) {
      return NextResponse.json(
        { profile: null },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const ranked = candidates
      .map((c) => {
        const sameCommune = !!me.commune && c.commune === me.commune;
        const sameReligion = !!me.religion && c.religion === me.religion;
        const sameIntent = c.intent === me.intent;
        const score = (sameCommune ? 34 : 0) + (sameReligion ? 33 : 0) + (sameIntent ? 33 : 0);
        return { candidate: c, score, sameCommune, sameReligion, sameIntent };
      })
      .sort((a, b) => b.score - a.score);

    const top = ranked[0]!;

    return NextResponse.json(
      {
        profile: toProfileCard(top.candidate),
        compatibility: {
          score: top.score,
          sameCommune: top.sameCommune,
          sameReligion: top.sameReligion,
          sameIntent: top.sameIntent,
        },
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
