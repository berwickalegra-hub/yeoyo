// POST /api/profile — one-shot creation from the onboarding wizard
// (frontend/src/app/onboarding). GET /api/profile — read the caller's own
// profile (404 if the onboarding wizard hasn't been completed yet).
//
// The Banani onboarding designs never surface a minimum-age gate — added
// here anyway, since a dating app collecting date of birth without an age
// floor is both a legal problem (most jurisdictions bar minors from
// dating/matrimonial services) and an easy oversight to miss when
// translating a mockup that only shows the happy path.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { FileUpload, Profile, ProfilePhoto } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { ageInYears } from '@/lib/server/profile/card';
import { cloudinaryUrlForKey } from '@/lib/server/storage';
import { COUNTRY_CODES } from '@/lib/yeoyo/constants';

const MIN_AGE_YEARS = 18;

// An AFFILIATE-role account has no dating-app-facing identity — it must
// never be able to read, create, or update a Profile. `requireAuth()`
// (protected file, lib/server/middleware/index.ts) intentionally returns a
// minimal AuthContext with no `role`, so this route re-queries the fresh
// role itself (same pattern as profile/boost/route.ts) rather than trusting
// a JWT claim.
async function rejectIfAffiliate(userId: string, requestId: string): Promise<NextResponse | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role === 'AFFILIATE') {
    return NextResponse.json(
      {
        code: 'AFFILIATE_ACCOUNT',
        message: 'Un compte Affilié ne peut pas créer ou modifier de profil de rencontre.',
      },
      { status: 403, headers: { 'x-request-id': requestId } },
    );
  }
  return null;
}

type ProfileWithPhotos = Profile & { photos: (ProfilePhoto & { fileUpload: FileUpload })[] };

// Same "primary wins, else first" resolution as profile/card.ts's
// toProfileCard — kept separate since this route returns the full Profile
// row (all fields), not the trimmed public ProfileCard shape.
function profileWithPhotoUrls(profile: ProfileWithPhotos) {
  const { photos, ...rest } = profile;
  const primary = photos.find((p) => p.isPrimary) ?? photos[0];
  const photoUrls = photos
    .map((p) => cloudinaryUrlForKey(p.fileUpload.key))
    .filter((url): url is string => !!url);
  return {
    ...rest,
    hasPhoto: photos.length > 0,
    photoUrl: primary ? cloudinaryUrlForKey(primary.fileUpload.key) : null,
    photoUrls,
    // Ids alongside URLs — Mon profil's photo-management strip needs them
    // for POST/DELETE /api/profile/photos; every other ProfileCard consumer
    // only ever reads photoUrls.
    photos: photos.map((p) => ({
      id: p.id,
      url: cloudinaryUrlForKey(p.fileUpload.key),
      isPrimary: p.isPrimary,
    })),
  };
}

const Body = z.object({
  gender: z.enum(['HOMME', 'FEMME']),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).optional(),
  dateOfBirth: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date'),
  country: z.enum(COUNTRY_CODES),
  city: z.string().trim().min(1).max(60),
  commune: z.string().trim().max(60).optional(),
  religion: z.enum(['CHRETIEN', 'CATHOLIQUE', 'PROTESTANT', 'MUSULMAN']).optional(),
  maritalStatus: z.enum(['CELIBATAIRE', 'DIVORCE', 'VEUF_VEUVE']).optional(),
  childrenCount: z.enum(['0', '1', '2', '3+']).optional(),
  wantsChildren: z.enum(['OUI', 'NON', 'PEUT_ETRE']).optional(),
  interestedIn: z.enum(['HOMME', 'FEMME', 'TOUS']).optional(),
  intent: z.enum(['COURT_TERME', 'MOYEN_TERME', 'LONG_TERME']),
  bio: z.string().trim().max(500).optional(),
  photoUploadId: z.string().optional(),
});

// Paramètres screen's "Profil" (visibility/online-status toggles) and
// "Préférences de recherche" (commune/intent) sections both edit fields
// already on Profile — reusing them instead of a separate searchPrefs blob
// keeps discovery/explorer filtering and "my own search prefs" in sync by
// construction (see profile/card.ts consumers).
const PatchBody = z
  .object({
    visibilityPublic: z.boolean().optional(),
    onlineStatusVisible: z.boolean().optional(),
    country: z.enum(COUNTRY_CODES).optional(),
    city: z.string().trim().min(1).max(60).optional(),
    commune: z.string().trim().max(60).nullable().optional(),
    intent: z.enum(['COURT_TERME', 'MOYEN_TERME', 'LONG_TERME']).optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    religion: z.enum(['CHRETIEN', 'CATHOLIQUE', 'PROTESTANT', 'MUSULMAN']).nullable().optional(),
    maritalStatus: z.enum(['CELIBATAIRE', 'DIVORCE', 'VEUF_VEUVE']).nullable().optional(),
    childrenCount: z.enum(['0', '1', '2', '3+']).nullable().optional(),
    wantsChildren: z.enum(['OUI', 'NON', 'PEUT_ETRE']).nullable().optional(),
    relocateOpen: z.enum(['OUI', 'NON', 'A_DISCUTER']).nullable().optional(),
    qualities: z.string().trim().max(300).nullable().optional(),
    flaws: z.string().trim().max(300).nullable().optional(),
    dealbreakers: z.string().trim().max(300).nullable().optional(),
    interests: z.array(z.string().trim().min(1).max(30)).max(15).optional(),
    // Null = default (opposite of `gender`). "TOUS" = show both genders by
    // default in Découvrir/Explorer. See POST /api/profile/photos for photo
    // management — that moved to its own endpoint once profiles gained a
    // multi-photo carousel (this route only ever replaced a single photo).
    interestedIn: z.enum(['HOMME', 'FEMME', 'TOUS']).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'At least one field required');

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const affiliateFail = await rejectIfAffiliate(auth.user.sub, ctx.requestId);
    if (affiliateFail) return affiliateFail;

    const profile = await prisma.profile.findUnique({
      where: { userId: auth.user.sub },
      include: { photos: { orderBy: { order: 'asc' }, include: { fileUpload: true } } },
    });
    if (!profile) {
      return NextResponse.json(
        { code: 'PROFILE_NOT_FOUND', message: 'No profile yet' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { profile: { ...profileWithPhotoUrls(profile) } },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const affiliateFail = await rejectIfAffiliate(auth.user.sub, ctx.requestId);
    if (affiliateFail) return affiliateFail;

    const json: unknown = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          code: 'VALIDATION_FAILED',
          message: 'Merci de vérifier les informations saisies.',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const input = parsed.data;

    const dateOfBirth = new Date(input.dateOfBirth);
    if (ageInYears(dateOfBirth) < MIN_AGE_YEARS) {
      return NextResponse.json(
        {
          code: 'AGE_BELOW_MINIMUM',
          message: `Tu dois avoir au moins ${MIN_AGE_YEARS} ans pour utiliser YeOyo.`,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.profile.findUnique({ where: { userId: auth.user.sub } });
    if (existing) {
      return NextResponse.json(
        { code: 'PROFILE_ALREADY_EXISTS', message: 'Ton profil existe déjà.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (input.photoUploadId) {
      const upload = await prisma.fileUpload.findFirst({
        where: { id: input.photoUploadId, userId: auth.user.sub },
      });
      if (!upload) {
        return NextResponse.json(
          { code: 'PHOTO_NOT_FOUND', message: "Cette photo n'a pas pu être retrouvée. Réessaie." },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const profile = await prisma.profile.create({
      data: {
        userId: auth.user.sub,
        gender: input.gender,
        firstName: input.firstName,
        ...(input.lastName ? { lastName: input.lastName } : {}),
        dateOfBirth,
        country: input.country,
        city: input.city,
        ...(input.commune ? { commune: input.commune } : {}),
        ...(input.religion ? { religion: input.religion } : {}),
        ...(input.maritalStatus ? { maritalStatus: input.maritalStatus } : {}),
        ...(input.childrenCount ? { childrenCount: input.childrenCount } : {}),
        ...(input.wantsChildren ? { wantsChildren: input.wantsChildren } : {}),
        ...(input.interestedIn ? { interestedIn: input.interestedIn } : {}),
        intent: input.intent,
        ...(input.bio ? { bio: input.bio } : {}),
        onboardingCompletedAt: new Date(),
        ...(input.photoUploadId
          ? {
              photos: {
                create: [{ fileUploadId: input.photoUploadId, isPrimary: true, order: 0 }],
              },
            }
          : {}),
      },
      select: { id: true },
    });

    return NextResponse.json(
      { id: profile.id },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const affiliateFail = await rejectIfAffiliate(auth.user.sub, ctx.requestId);
    if (affiliateFail) return affiliateFail;

    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.profile.findUnique({ where: { userId: auth.user.sub } });
    if (!existing) {
      return NextResponse.json(
        { code: 'PROFILE_NOT_FOUND', message: 'Complete onboarding first' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const {
      visibilityPublic,
      onlineStatusVisible,
      country,
      city,
      commune,
      intent,
      bio,
      religion,
      maritalStatus,
      childrenCount,
      wantsChildren,
      relocateOpen,
      qualities,
      flaws,
      dealbreakers,
      interestedIn,
      interests,
    } = parsed.data;

    const profile = await prisma.profile.update({
      where: { userId: auth.user.sub },
      data: {
        ...(visibilityPublic !== undefined ? { visibilityPublic } : {}),
        ...(onlineStatusVisible !== undefined ? { onlineStatusVisible } : {}),
        ...(country !== undefined ? { country } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(commune !== undefined ? { commune } : {}),
        ...(intent !== undefined ? { intent } : {}),
        ...(bio !== undefined ? { bio } : {}),
        ...(religion !== undefined ? { religion } : {}),
        ...(maritalStatus !== undefined ? { maritalStatus } : {}),
        ...(childrenCount !== undefined ? { childrenCount } : {}),
        ...(wantsChildren !== undefined ? { wantsChildren } : {}),
        ...(relocateOpen !== undefined ? { relocateOpen } : {}),
        ...(qualities !== undefined ? { qualities } : {}),
        ...(flaws !== undefined ? { flaws } : {}),
        ...(dealbreakers !== undefined ? { dealbreakers } : {}),
        ...(interestedIn !== undefined ? { interestedIn } : {}),
        ...(interests !== undefined ? { interests } : {}),
      },
      include: { photos: { orderBy: { order: 'asc' }, include: { fileUpload: true } } },
    });

    return NextResponse.json(
      { profile: { ...profileWithPhotoUrls(profile) } },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
