// GET /api/admin/verification-queue — the Admin Panel "Vérification"
// panel. Profiles that submitted a code-in-hand selfie (see
// /api/profile/verification) and are waiting on a human decision, oldest
// submission first. Each item carries the selfie, the code we asked the
// user to write, and the profile photos so the admin can compare faces.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { ageInYears } from '@/lib/server/profile/card';
import { cloudinaryUrlForKey } from '@/lib/server/storage';

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
        where: { verificationStatus: 'PENDING' },
        orderBy: { verificationSubmittedAt: 'asc' },
        take: limit,
        select: {
          id: true,
          userId: true,
          firstName: true,
          dateOfBirth: true,
          commune: true,
          city: true,
          verificationSubmittedAt: true,
          verificationCode: true,
          verificationSelfieKey: true,
          photos: {
            orderBy: { order: 'asc' },
            select: { id: true, fileUpload: { select: { key: true } } },
          },
        },
      }),
      prisma.profile.count({ where: { verificationStatus: 'PENDING' } }),
    ]);

    return NextResponse.json(
      {
        items: profiles.map((p) => ({
          id: p.id,
          userId: p.userId,
          firstName: p.firstName,
          age: ageInYears(p.dateOfBirth),
          city: p.commune ?? p.city,
          waitingSince: p.verificationSubmittedAt?.toISOString() ?? null,
          code: p.verificationCode,
          selfieUrl: p.verificationSelfieKey ? cloudinaryUrlForKey(p.verificationSelfieKey) : null,
          photoCount: p.photos.length,
          photoUrls: p.photos
            .map((ph) => cloudinaryUrlForKey(ph.fileUpload.key))
            .filter((u): u is string => !!u),
        })),
        total,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
