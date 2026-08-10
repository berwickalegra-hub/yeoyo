// DELETE /api/profile/photos/[photoId] — remove one photo from the caller's
// carousel. If the removed photo was primary, promotes the next-lowest
// `order` photo to primary so the profile never ends up with photos but no
// primary (every card renderer assumes photoUrl reflects *a* photo when
// hasPhoto is true).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { cloudinaryUrlForKey } from '@/lib/server/storage';

export async function DELETE(
  req: NextRequest,
  routeCtx: { params: Promise<{ photoId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { photoId } = await routeCtx.params;

    const profile = await prisma.profile.findUnique({ where: { userId: auth.user.sub } });
    if (!profile) {
      return NextResponse.json(
        { code: 'PROFILE_NOT_FOUND', message: 'Complete onboarding first' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const photo = await prisma.profilePhoto.findFirst({
      where: { id: photoId, profileId: profile.id },
    });
    if (!photo) {
      return NextResponse.json(
        { code: 'PHOTO_NOT_FOUND', message: 'Photo not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.profilePhoto.delete({ where: { id: photo.id } });

    if (photo.isPrimary) {
      const next = await prisma.profilePhoto.findFirst({
        where: { profileId: profile.id },
        orderBy: { order: 'asc' },
      });
      if (next) {
        await prisma.profilePhoto.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
    }

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
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
