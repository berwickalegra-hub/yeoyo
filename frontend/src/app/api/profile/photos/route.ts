// POST /api/profile/photos — append a photo to the caller's carousel
// (2026-08-10, user-driven: "ajouter les images" — Mon profil previously
// only supported *replacing* a single photo via PATCH /api/profile, which
// couldn't express "add a second/third photo"). The first photo added
// becomes primary automatically; later ones just extend the ordered list.
// DELETE lives at /api/profile/photos/[photoId] (sibling route).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { cloudinaryUrlForKey } from '@/lib/server/storage';

// Keeps the carousel skimmable (matches the WhatsApp-status-style segmented
// indicator's reasonable segment count) and bounds upload abuse.
const MAX_PHOTOS = 6;

const Body = z.object({ uploadId: z.string().min(1) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: auth.user.sub },
      include: { photos: true },
    });
    if (!profile) {
      return NextResponse.json(
        { code: 'PROFILE_NOT_FOUND', message: 'Complete onboarding first' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (profile.photos.length >= MAX_PHOTOS) {
      return NextResponse.json(
        { code: 'PHOTO_LIMIT_REACHED', message: `Maximum ${MAX_PHOTOS} photos` },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const upload = await prisma.fileUpload.findFirst({
      where: { id: parsed.data.uploadId, userId: auth.user.sub },
    });
    if (!upload) {
      return NextResponse.json(
        { code: 'PHOTO_NOT_FOUND', message: 'uploadId does not belong to this user' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.profilePhoto.create({
      data: {
        profileId: profile.id,
        fileUploadId: upload.id,
        isPrimary: profile.photos.length === 0,
        order: profile.photos.length,
      },
    });

    const photos = await prisma.profilePhoto.findMany({
      where: { profileId: profile.id },
      orderBy: { order: 'asc' },
      include: { fileUpload: true },
    });

    return NextResponse.json(
      {
        photos: photos.map((p) => ({
          id: p.id,
          isPrimary: p.isPrimary,
          url: cloudinaryUrlForKey(p.fileUpload.key),
        })),
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
