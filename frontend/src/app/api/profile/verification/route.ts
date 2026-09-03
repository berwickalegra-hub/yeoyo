// GET  /api/profile/verification — the caller's own identity-verification
//                                  state, for the /app/verification screen.
// POST /api/profile/verification — submit a code-in-hand selfie for review.
//
// Self-service flow added 2026-08-31 (explicit user ask: "n'importe qui doit
// pouvoir faire la vérification, avec des exemples clairs"). We show the
// user a short code, they write it on paper and hold it in a selfie; an
// admin then compares that selfie to the profile photos and approves or
// rejects (POST /api/admin/verification-queue/[id]/process). See
// schema.prisma Profile.verification* for the lifecycle.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { cloudinaryUrlForKey } from '@/lib/server/storage';

// Short, unambiguous (no O/0/I/1) code the user copies onto paper. The point
// is not secrecy — it's proving the selfie is fresh and specifically for us.
function newVerificationCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `YO-${s}`;
}

const OPEN_STATES = new Set(['UNVERIFIED', 'REJECTED']);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const profile = await prisma.profile.findUnique({
      where: { userId: auth.user.sub },
      select: {
        verificationStatus: true,
        verificationCode: true,
        verificationSelfieKey: true,
        verificationSubmittedAt: true,
        verificationRejectionReason: true,
        verifiedAt: true,
        _count: { select: { photos: true } },
      },
    });
    if (!profile) {
      return NextResponse.json(
        { code: 'PROFILE_NOT_FOUND', message: 'Complete onboarding first' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Issue (and persist) a code as soon as the user can act on it, so the
    // page always has one to show without a separate "generate" call.
    let code = profile.verificationCode;
    if (OPEN_STATES.has(profile.verificationStatus) && !code) {
      code = newVerificationCode();
      await prisma.profile.update({
        where: { userId: auth.user.sub },
        data: { verificationCode: code },
      });
    }

    return NextResponse.json(
      {
        status: profile.verificationStatus,
        code: OPEN_STATES.has(profile.verificationStatus) ? code : null,
        selfieUrl: profile.verificationSelfieKey
          ? cloudinaryUrlForKey(profile.verificationSelfieKey)
          : null,
        submittedAt: profile.verificationSubmittedAt?.toISOString() ?? null,
        rejectionReason: profile.verificationRejectionReason,
        verifiedAt: profile.verifiedAt?.toISOString() ?? null,
        hasPhoto: profile._count.photos > 0,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

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
        { code: 'VALIDATION_FAILED', message: 'Une photo est requise.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: auth.user.sub },
      select: {
        verificationStatus: true,
        verificationCode: true,
        _count: { select: { photos: true } },
      },
    });
    if (!profile) {
      return NextResponse.json(
        { code: 'PROFILE_NOT_FOUND', message: 'Complete onboarding first' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (profile.verificationStatus === 'VERIFIED') {
      return NextResponse.json(
        { code: 'ALREADY_VERIFIED', message: 'Ton profil est déjà vérifié.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (profile.verificationStatus === 'PENDING') {
      return NextResponse.json(
        { code: 'ALREADY_PENDING', message: 'Ta demande est déjà en cours d’examen.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (profile._count.photos === 0) {
      return NextResponse.json(
        {
          code: 'PROFILE_PHOTO_REQUIRED',
          message: 'Ajoute d’abord au moins une photo à ton profil.',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const upload = await prisma.fileUpload.findFirst({
      where: { id: parsed.data.uploadId, userId: auth.user.sub },
      select: { key: true },
    });
    if (!upload) {
      return NextResponse.json(
        { code: 'PHOTO_NOT_FOUND', message: 'Cette photo n’a pas pu être retrouvée. Réessaie.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Keep the code the user was shown (they wrote THAT one on paper). Fall
    // back to a fresh one only if somehow none was issued.
    const code = profile.verificationCode ?? newVerificationCode();

    await prisma.profile.update({
      where: { userId: auth.user.sub },
      data: {
        verificationStatus: 'PENDING',
        verificationSelfieKey: upload.key,
        verificationCode: code,
        verificationSubmittedAt: new Date(),
        verificationRejectionReason: null,
      },
    });

    return NextResponse.json(
      { status: 'PENDING' },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
