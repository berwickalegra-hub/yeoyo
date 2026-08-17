// GET /api/admin/stats/overview — Admin Panel dashboard: 4 KPI cards +
// 2 chart datasets (signups/month, member breakdown donut).
//
// Member breakdown mirrors the Banani donut's 4 mutually-exclusive buckets
// (Actifs/Vérifiés/En attente/Inactifs, sums to 100%): verified and
// pending-verification come from Profile.verificationStatus, "Inactifs"
// maps to User.status === 'SUSPENDED' (the closest existing concept — this
// kit has no separate "inactive" user state), and "Actifs" is everyone
// else (total minus the other three buckets).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

interface MonthlySignup {
  month: Date;
  count: bigint;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const [
      totalMembers,
      premiumSubscribers,
      pendingReports,
      revenueAgg,
      verifiedCount,
      pendingVerificationCount,
      suspendedCount,
      signupsRaw,
    ] = await Promise.all([
      prisma.user.count(),
      // Excludes provider: 'admin-grant' (2026-08-17) — the admin-always-
      // Premium self-heal (see /api/subscriptions/me) and the admin panel's
      // own grant toggle both tag their Subscription rows this way
      // precisely so this KPI keeps meaning "paying subscribers", not
      // "accounts flagged Premium for any reason".
      prisma.subscription.count({ where: { status: 'ACTIVE', provider: { not: 'admin-grant' } } }),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.order.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
      prisma.profile.count({ where: { verificationStatus: 'VERIFIED' } }),
      prisma.profile.count({
        where: { verificationStatus: 'PENDING', onboardingCompletedAt: { not: null } },
      }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.$queryRaw<MonthlySignup[]>`
        SELECT date_trunc('month', "createdAt") AS month, count(*)::bigint AS count
        FROM "User"
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `,
    ]);

    const activeCount = Math.max(
      0,
      totalMembers - verifiedCount - pendingVerificationCount - suspendedCount,
    );

    return NextResponse.json(
      {
        kpis: {
          totalMembers,
          premiumSubscribers,
          pendingReports,
          revenueCentsTotal: revenueAgg._sum.amount ?? 0,
        },
        signupsByMonth: signupsRaw
          .map((r) => ({ month: r.month.toISOString().slice(0, 7), count: Number(r.count) }))
          .reverse(),
        memberBreakdown: {
          active: activeCount,
          verified: verifiedCount,
          pendingVerification: pendingVerificationCount,
          suspended: suspendedCount,
        },
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
