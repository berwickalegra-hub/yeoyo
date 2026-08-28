// GET /api/admin/users/[id]/detail — the member detail fiche powering
// admin/(dashboard)/membres/[id], reachable from both the Membres list and
// the Vérification IA queue (both link by User id). Separate from the
// leaner /api/admin/users/[id] (used by the Membres table's inline row
// actions) since this pulls a much wider join — profile + photos +
// activity counts + report history — that the list view never needs.
//
// No AI verification vendor is wired in this kit (see verification-queue's
// own header comment) — there is no similarity/confidence score and no
// reverse-image/AI-generated-photo signal anywhere in the schema. Rather
// than fabricate one, this route simply omits those fields; the fiche
// renders an explicit "non disponible" state instead of a fake number.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { ageInYears } from '@/lib/server/profile/card';
import { cloudinaryUrlForKey } from '@/lib/server/storage';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  creditBalance: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('MODERATOR');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;

    const [user, profile, likesSent, contactRequestsSent, reportsReceived, reportsFiled] =
      await Promise.all([
        prisma.user.findUnique({ where: { id }, select: USER_SELECT }),
        prisma.profile.findUnique({
          where: { userId: id },
          include: {
            photos: {
              orderBy: { order: 'asc' },
              include: { fileUpload: { select: { key: true } } },
            },
          },
        }),
        prisma.like.count({ where: { likerId: id } }),
        prisma.contactRequest.count({ where: { requesterId: id } }),
        prisma.report.findMany({
          where: { targetId: id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { reporter: { select: { name: true, email: true } } },
        }),
        prisma.report.findMany({
          where: { reporterId: id },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { target: { select: { name: true, email: true } } },
        }),
      ]);

    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        user,
        profile: profile
          ? {
              id: profile.id,
              firstName: profile.firstName,
              lastName: profile.lastName,
              age: ageInYears(profile.dateOfBirth),
              city: profile.commune ?? profile.city,
              country: profile.country,
              intent: profile.intent,
              bio: profile.bio,
              verificationStatus: profile.verificationStatus,
              verifiedAt: profile.verifiedAt?.toISOString() ?? null,
              onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
              photos: profile.photos.map((p) => ({
                id: p.id,
                url: cloudinaryUrlForKey(p.fileUpload.key),
                isPrimary: p.isPrimary,
              })),
            }
          : null,
        activity: { likesSent, contactRequestsSent },
        reportsReceived: reportsReceived.map((r) => ({
          id: r.id,
          reason: r.reason,
          details: r.details,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          reporterName: r.reporter.name ?? r.reporter.email,
        })),
        reportsFiled: reportsFiled.map((r) => ({
          id: r.id,
          reason: r.reason,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          targetName: r.target.name ?? r.target.email,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
