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
import { startOfUtcDay } from '@/lib/server/daily-quota';

interface MonthlySignup {
  month: Date;
  count: bigint;
}

interface MonthlySubscriptions {
  month: Date;
  count: bigint;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const today = startOfUtcDay();
    const now = new Date();
    const startOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [
      totalMembers,
      premiumSubscribers,
      pendingReports,
      revenueAgg,
      verifiedCount,
      pendingVerificationCount,
      suspendedCount,
      signupsRaw,
      subscriptionsRaw,
      // KPI deltas — "value as of the start of this month" for each of the 4
      // KPIs above, so the dashboard can show real "vs mois dernier" growth
      // instead of Banani's mocked percentages. For premiumSubscribers and
      // pendingReports (status-based, not append-only) this is an
      // approximation — a subscription/report created before this month but
      // whose status changed since can't be reconstructed exactly without
      // event history — but it's a real derived number, not fabricated.
      totalMembersPrevMonth,
      premiumSubscribersPrevMonth,
      pendingReportsPrevMonth,
      revenuePrevMonthAgg,
      newSignupsToday,
      messagesToday,
      matchesToday,
      suspensionsToday,
      paidSubscriptionsToday,
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
      prisma.$queryRaw<MonthlySubscriptions[]>`
        SELECT date_trunc('month', "createdAt") AS month, count(*)::bigint AS count
        FROM "Subscription"
        WHERE "provider" != 'admin-grant'
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `,
      prisma.user.count({ where: { createdAt: { lt: startOfThisMonth } } }),
      prisma.subscription.count({
        where: {
          status: 'ACTIVE',
          provider: { not: 'admin-grant' },
          createdAt: { lt: startOfThisMonth },
        },
      }),
      prisma.report.count({ where: { status: 'PENDING', createdAt: { lt: startOfThisMonth } } }),
      prisma.order.aggregate({
        where: { status: 'PAID', paidAt: { lt: startOfThisMonth } },
        _sum: { amount: true },
      }),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.message.count({ where: { createdAt: { gte: today } } }),
      // A Conversation is created exactly when a contact request is
      // accepted — the closest real concept this schema has to "match".
      prisma.conversation.count({ where: { createdAt: { gte: today } } }),
      prisma.adminAction.count({ where: { action: 'user.suspend', createdAt: { gte: today } } }),
      prisma.order.count({ where: { status: 'PAID', paidAt: { gte: today } } }),
    ]);

    const activeCount = Math.max(
      0,
      totalMembers - verifiedCount - pendingVerificationCount - suspendedCount,
    );
    const revenueCentsTotal = revenueAgg._sum.amount ?? 0;
    const revenueCentsPrevMonth = revenuePrevMonthAgg._sum.amount ?? 0;

    const subscriptionsByMonthMap = new Map(
      subscriptionsRaw.map((r) => [r.month.toISOString().slice(0, 7), Number(r.count)]),
    );

    return NextResponse.json(
      {
        kpis: {
          totalMembers,
          premiumSubscribers,
          pendingReports,
          revenueCentsTotal,
          deltas: {
            totalMembers: pctDelta(totalMembers, totalMembersPrevMonth),
            premiumSubscribers: pctDelta(premiumSubscribers, premiumSubscribersPrevMonth),
            pendingReports: pctDelta(pendingReports, pendingReportsPrevMonth),
            revenueCentsTotal: pctDelta(revenueCentsTotal, revenueCentsPrevMonth),
          },
        },
        signupsByMonth: signupsRaw
          .map((r) => {
            const month = r.month.toISOString().slice(0, 7);
            return {
              month,
              count: Number(r.count),
              subscriptions: subscriptionsByMonthMap.get(month) ?? 0,
            };
          })
          .reverse(),
        memberBreakdown: {
          active: activeCount,
          verified: verifiedCount,
          pendingVerification: pendingVerificationCount,
          suspended: suspendedCount,
        },
        today: {
          newSignups: newSignupsToday,
          messagesSent: messagesToday,
          matchesCreated: matchesToday,
          accountsSuspended: suspensionsToday,
          subscriptionsPaid: paidSubscriptionsToday,
        },
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
