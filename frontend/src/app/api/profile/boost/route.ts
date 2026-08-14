// GET /api/profile/boost — current boost status + whether the caller can
// boost right now.
// POST /api/profile/boost — activate a boost: the profile sorts first
// (tie-break only) in GET /api/profiles/explorer for BOOST_DURATION_MS.
// Free users: 1 boost per rolling 24h, tracked from the *previous*
// activation time (boostedUntil - BOOST_DURATION_MS), not from expiry —
// so back-to-back boosts can't be chained. ACTIVE Premium subscribers are
// unlimited. See IMPLEMENTATION-PLAN-v2.md for the disclosed defaults
// (no spec beyond the button/badge existing in the Banani mockup).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const BOOST_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const FREE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

interface BoostStatus {
  active: boolean;
  boostedUntil: string | null;
  isPremium: boolean;
  canBoost: boolean;
  cooldownEndsAt: string | null;
}

async function boostStatus(userId: string): Promise<BoostStatus> {
  const [profile, activeSub] = await Promise.all([
    prisma.profile.findUnique({ where: { userId }, select: { boostedUntil: true } }),
    prisma.subscription.findFirst({ where: { userId, status: 'ACTIVE' }, select: { id: true } }),
  ]);
  const now = new Date();
  const isPremium = !!activeSub;
  const active = !!profile?.boostedUntil && profile.boostedUntil > now;

  let cooldownEndsAt: Date | null = null;
  if (!isPremium && profile?.boostedUntil) {
    const lastActivatedAt = new Date(profile.boostedUntil.getTime() - BOOST_DURATION_MS);
    const cooldownEnd = new Date(lastActivatedAt.getTime() + FREE_COOLDOWN_MS);
    if (cooldownEnd > now) cooldownEndsAt = cooldownEnd;
  }

  return {
    active,
    boostedUntil: profile?.boostedUntil?.toISOString() ?? null,
    isPremium,
    canBoost: isPremium || !cooldownEndsAt,
    cooldownEndsAt: cooldownEndsAt?.toISOString() ?? null,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const status = await boostStatus(auth.user.sub);
    return NextResponse.json(status, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const profile = await prisma.profile.findUnique({ where: { userId: auth.user.sub } });
    if (!profile || !profile.onboardingCompletedAt) {
      return NextResponse.json(
        { code: 'PROFILE_REQUIRED', message: 'Complete onboarding first' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const status = await boostStatus(auth.user.sub);
    if (!status.canBoost) {
      return NextResponse.json(
        {
          code: 'BOOST_COOLDOWN_ACTIVE',
          message: 'Ton boost gratuit revient bientôt — passe Premium pour un boost illimité.',
          cooldownEndsAt: status.cooldownEndsAt,
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const boostedUntil = new Date(Date.now() + BOOST_DURATION_MS);
    await prisma.profile.update({ where: { userId: auth.user.sub }, data: { boostedUntil } });

    return NextResponse.json(
      { active: true, boostedUntil: boostedUntil.toISOString() },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
