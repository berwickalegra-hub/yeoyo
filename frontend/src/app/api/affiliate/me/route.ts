// GET /api/affiliate/me — the affiliate dashboard's single data source.
// Aggregates everything the /affilie dashboard page needs in one
// round-trip: code + shareable link, signup/verification counters,
// earnings breakdown (total/pending/paid, by type), last payout date, a
// per-referred-user earnings list, and a real 6-month history (earnings +
// signups bucketed by calendar month, UTC) that drives the dashboard's
// bar chart — derived from AffiliateEarning.createdAt and each referred
// user's createdAt, never fabricated.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAffiliate } from '@/lib/server/middleware/require-affiliate';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAffiliate();
    if (auth instanceof NextResponse) return auth;

    const affiliateId = auth.affiliate.id;

    const [me, totalSignups, verifiedMen, verifiedWomen, earnings, referredUsers] =
      await Promise.all([
        prisma.user.findUnique({ where: { id: affiliateId }, select: { name: true } }),
        prisma.user.count({ where: { referredByAffiliateId: affiliateId } }),
        prisma.profile.count({
          where: {
            user: { referredByAffiliateId: affiliateId },
            gender: 'HOMME',
            verificationStatus: 'VERIFIED',
          },
        }),
        prisma.profile.count({
          where: {
            user: { referredByAffiliateId: affiliateId },
            gender: 'FEMME',
            verificationStatus: 'VERIFIED',
          },
        }),
        prisma.affiliateEarning.findMany({
          where: { affiliateId },
          select: { amount: true, type: true, paidAt: true, referredUserId: true, createdAt: true },
        }),
        prisma.user.findMany({
          where: { referredByAffiliateId: affiliateId },
          select: {
            id: true,
            createdAt: true,
            profile: { select: { firstName: true, verificationStatus: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    const totalEarned = earnings.reduce((s, e) => s + e.amount, 0);
    const totalPending = earnings.filter((e) => !e.paidAt).reduce((s, e) => s + e.amount, 0);
    const totalPaid = earnings.filter((e) => !!e.paidAt).reduce((s, e) => s + e.amount, 0);
    const verificationBonusTotal = earnings
      .filter((e) => e.type === 'VERIFICATION_BONUS')
      .reduce((s, e) => s + e.amount, 0);
    const commissionTotal = earnings
      .filter((e) => e.type === 'CREDIT_COMMISSION')
      .reduce((s, e) => s + e.amount, 0);
    const lastPaidAt = earnings.reduce<Date | null>(
      (max, e) => (e.paidAt && (!max || e.paidAt > max) ? e.paidAt : max),
      null,
    );

    const earningsByUser = new Map<string, number>();
    for (const e of earnings) {
      earningsByUser.set(e.referredUserId, (earningsByUser.get(e.referredUserId) ?? 0) + e.amount);
    }

    // 6-month history (current month + the 5 before it), keyed YYYY-MM in
    // UTC so the buckets are deterministic and test-stable.
    const now = new Date();
    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      monthKeys.push(
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
          .toISOString()
          .slice(0, 7),
      );
    }
    const earnedByMonth = new Map<string, number>();
    const signupsByMonth = new Map<string, number>();
    for (const e of earnings) {
      const k = e.createdAt.toISOString().slice(0, 7);
      earnedByMonth.set(k, (earnedByMonth.get(k) ?? 0) + e.amount);
    }
    for (const u of referredUsers) {
      const k = u.createdAt.toISOString().slice(0, 7);
      signupsByMonth.set(k, (signupsByMonth.get(k) ?? 0) + 1);
    }
    const monthly = monthKeys.map((month) => ({
      month,
      earned: earnedByMonth.get(month) ?? 0,
      signups: signupsByMonth.get(month) ?? 0,
    }));

    const referredUserList = referredUsers.map((u) => ({
      firstName: u.profile?.firstName ?? null,
      verificationStatus: u.profile?.verificationStatus ?? null,
      totalEarned: earningsByUser.get(u.id) ?? 0,
    }));

    return NextResponse.json(
      {
        affiliateCode: auth.affiliate.affiliateCode,
        email: auth.affiliate.email,
        name: me?.name ?? null,
        referralUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/onboarding?promo=${auth.affiliate.affiliateCode}`,
        counters: { totalSignups, verifiedMen, verifiedWomen },
        earnings: {
          total: totalEarned,
          pending: totalPending,
          paid: totalPaid,
          verificationBonusTotal,
          commissionTotal,
        },
        lastPaidAt,
        monthly,
        referredUsers: referredUserList,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
