// GET /api/profile/new-nearby-count — "N nouveaux profils cette semaine"
// stat for Accueil's rotating trust-zone widget. Scoped to the caller's own
// commune when set (more personal/meaningful); falls back to a city-wide
// count when the caller hasn't set a commune — `city` is a constant
// ("Kinshasa") across this app (see prisma/schema.prisma default), so a
// city-wide count is never city-specific in practice, only commune is.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const WINDOW_DAYS = 7;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const me = await prisma.profile.findUnique({
      where: { userId: auth.user.sub },
      select: { commune: true },
    });

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const count = await prisma.profile.count({
      where: {
        userId: { not: auth.user.sub },
        visibilityPublic: true,
        onboardingCompletedAt: { not: null },
        createdAt: { gte: since },
        ...(me?.commune ? { commune: me.commune } : {}),
      },
    });

    return NextResponse.json(
      { count, scope: me?.commune ? 'commune' : 'city', commune: me?.commune ?? null },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
