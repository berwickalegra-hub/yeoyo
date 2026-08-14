// GET /api/admin/verification-queue — the Admin Panel "Vérification IA"
// panel. No AI vendor is wired yet (see IMPLEMENTATION-PLAN.md §3.4) — this
// is the admin-manual-approval stand-in: profiles that finished onboarding
// but haven't been reviewed, oldest first (longest wait first).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { ageInYears } from '@/lib/server/profile/card';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('MODERATOR');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const limit = clampLimit(req.nextUrl.searchParams.get('limit'));

    const [profiles, total] = await Promise.all([
      prisma.profile.findMany({
        where: { verificationStatus: 'PENDING', onboardingCompletedAt: { not: null } },
        orderBy: { onboardingCompletedAt: 'asc' },
        take: limit,
        include: { photos: { where: { isPrimary: true }, take: 1, include: { fileUpload: true } } },
      }),
      prisma.profile.count({
        where: { verificationStatus: 'PENDING', onboardingCompletedAt: { not: null } },
      }),
    ]);

    return NextResponse.json(
      {
        items: profiles.map((p) => ({
          id: p.id,
          userId: p.userId,
          firstName: p.firstName,
          age: ageInYears(p.dateOfBirth),
          waitingSince: p.onboardingCompletedAt?.toISOString() ?? null,
          photoCount: p.photos.length,
        })),
        total,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
