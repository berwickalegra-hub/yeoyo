// GET /api/profile/boost — current boost status (active or not).
// POST /api/profile/boost — activate a boost for BOOST_DURATION_MS: the
// profile sorts first (tie-break only) in GET /api/profiles/explorer.
// 2026-08-25: pay-per-use — always 3 credits per activation via
// lib/server/credits/ledger.ts (spendCredits), no more free-tier cooldown.
// ADMIN/SUPERADMIN bypass the charge (see ledger.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { spendCredits, CREDIT_COSTS } from '@/lib/server/credits/ledger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const BOOST_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface BoostStatus {
  active: boolean;
  boostedUntil: string | null;
  cost: number;
}

async function boostStatus(userId: string): Promise<BoostStatus> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { boostedUntil: true },
  });
  const active = !!profile?.boostedUntil && profile.boostedUntil > new Date();
  return {
    active,
    boostedUntil: profile?.boostedUntil?.toISOString() ?? null,
    cost: CREDIT_COSTS.boost,
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

    const [profile, user] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: auth.user.sub } }),
      prisma.user.findUnique({ where: { id: auth.user.sub }, select: { role: true } }),
    ]);
    if (!profile || !profile.onboardingCompletedAt) {
      return NextResponse.json(
        { code: 'PROFILE_REQUIRED', message: 'Complete onboarding first' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const spend = await spendCredits(prisma, {
      userId: auth.user.sub,
      action: 'boost',
      role: user?.role ?? null,
    });
    if (!spend.ok) {
      return NextResponse.json(
        {
          code: 'INSUFFICIENT_CREDITS',
          message: 'Solde de crédits insuffisant pour booster ton profil.',
          balance: spend.balance,
          cost: CREDIT_COSTS.boost,
        },
        { status: 402, headers: { 'x-request-id': ctx.requestId } },
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
