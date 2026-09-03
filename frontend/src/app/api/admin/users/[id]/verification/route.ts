// POST /api/admin/users/[id]/verification — manually flip a member's profile
// verification WITHOUT the self-service code-in-hand selfie flow. The admin
// looked at the profile photos, judged them genuine, and vouches for the
// account directly. `id` is the User id (consistent with the sibling
// /users/[id]/{status,moderation,credits,role} routes).
//
// VERIFY   → verificationStatus = VERIFIED, verifiedAt = now, and every
//            leftover field from a past request (selfie key, code,
//            submittedAt, rejection reason) is cleared. Sends the standard
//            "profil vérifié" notification.
// UNVERIFY → verificationStatus = UNVERIFIED, verifiedAt = null. Silent
//            (no notification).
//
// Idempotent no-op when the profile is already in the target state — no
// write, no audit noise, no duplicate notification.
//
// Gated at MODERATOR — same tier as the verification queue itself.
//
// Deliberately does NOT run the referral verification bonus (points / FCFA
// to the referrer). That reward is tied to a member completing the
// self-service verification; a manual admin override is an exceptional path
// and stays out of the referral ledger.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { createNotification } from '@/lib/server/notifications';
import { profileVerified } from '@/lib/server/notifications/templates';

const Body = z.object({ action: z.enum(['VERIFY', 'UNVERIFY']) });

type Result =
  | { kind: 'USER_NOT_FOUND' }
  | { kind: 'PROFILE_NOT_FOUND' }
  | { kind: 'NOOP'; status: string; verifiedAt: string | null }
  | { kind: 'OK'; status: string; verifiedAt: string | null; notify: { profileId: string } | null };

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('MODERATOR');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'action must be VERIFY or UNVERIFY' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { action } = parsed.data;

    const result: Result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!user) return { kind: 'USER_NOT_FOUND' };

      const profile = await tx.profile.findUnique({
        where: { userId: id },
        select: { id: true, verificationStatus: true, verifiedAt: true },
      });
      if (!profile) return { kind: 'PROFILE_NOT_FOUND' };

      const isVerified = profile.verificationStatus === 'VERIFIED';
      const isUnverified = profile.verificationStatus === 'UNVERIFIED';

      // Idempotent no-op.
      if (action === 'VERIFY' && isVerified) {
        return {
          kind: 'NOOP',
          status: 'VERIFIED',
          verifiedAt: profile.verifiedAt?.toISOString() ?? null,
        };
      }
      if (action === 'UNVERIFY' && isUnverified) {
        return { kind: 'NOOP', status: 'UNVERIFIED', verifiedAt: null };
      }

      if (action === 'VERIFY') {
        const now = new Date();
        await tx.profile.update({
          where: { userId: id },
          data: {
            verificationStatus: 'VERIFIED',
            verifiedAt: now,
            verificationSelfieKey: null,
            verificationCode: null,
            verificationSubmittedAt: null,
            verificationRejectionReason: null,
          },
        });
        await logAdminAction(tx, {
          actorId: auth.admin.id,
          action: 'profile.verify_manual',
          targetType: 'Profile',
          targetId: profile.id,
          metadata: { userId: id, from: profile.verificationStatus },
        });
        return {
          kind: 'OK',
          status: 'VERIFIED',
          verifiedAt: now.toISOString(),
          notify: { profileId: profile.id },
        };
      }

      // UNVERIFY
      await tx.profile.update({
        where: { userId: id },
        data: { verificationStatus: 'UNVERIFIED', verifiedAt: null },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'profile.unverify',
        targetType: 'Profile',
        targetId: profile.id,
        metadata: { userId: id, from: profile.verificationStatus },
      });
      return { kind: 'OK', status: 'UNVERIFIED', verifiedAt: null, notify: null };
    });

    if (result.kind === 'USER_NOT_FOUND' || result.kind === 'PROFILE_NOT_FOUND') {
      return NextResponse.json(
        { error: result.kind, message: 'Member or profile not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (result.kind === 'OK' && result.notify) {
      await createNotification(prisma, profileVerified(id, result.notify.profileId));
    }

    return NextResponse.json(
      {
        verification: {
          status: result.status,
          verifiedAt: result.verifiedAt,
          noop: result.kind === 'NOOP',
        },
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
