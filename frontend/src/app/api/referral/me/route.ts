// GET /api/referral/me — a regular user's own referral code, share link,
// and points progress. Lazily generates affiliateCode on first call: this
// user may have signed up before this feature existed, or via Google
// OAuth, which never assigns one at account-creation time (that callback
// route is CLAUDE.md-protected, so this plan deliberately never touches
// it — see docs/superpowers/specs/2026-08-31-referral-points-program-design.md §5.1).
//
// No CSRF check: this GET's only side effect (assigning a fresh random
// code to the caller's own account, the first time only) has no
// cross-site attack surface — a forged cross-origin request can neither
// choose the resulting code nor read the JSON response back (same-origin
// policy). Same reasoning already applied to GET /api/affiliate/me.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { generateUniqueAffiliateCode } from '@/lib/server/affiliates/code';
import { REFERRAL_POINTS_PER_CREDIT } from '@/lib/server/referrals/points';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const userId = auth.user.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { affiliateCode: true, referralPoints: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let code = user.affiliateCode;
    if (!code) {
      code = await generateUniqueAffiliateCode();
      await prisma.user.update({ where: { id: userId }, data: { affiliateCode: code } });
    }

    return NextResponse.json(
      {
        affiliateCode: code,
        referralPoints: user.referralPoints,
        pointsPerCredit: REFERRAL_POINTS_PER_CREDIT,
        referralUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/onboarding?promo=${code}`,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
