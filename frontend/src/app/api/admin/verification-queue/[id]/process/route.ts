// POST /api/admin/verification-queue/[id]/process — approve or reject a
// pending profile. `id` is the Profile id. Idempotent no-op if the profile
// already left PENDING (writes no AdminAction, same audit-noise guard as
// the other admin mutation routes).
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
import { profileRejected, profileVerified } from '@/lib/server/notifications/templates';
import { grantCredits } from '@/lib/server/credits/ledger';
import {
  REFERRAL_MONTHLY_CAP,
  REFERRAL_POINTS_PER_CREDIT,
  REFERRAL_POINTS_PER_VERIFICATION,
} from '@/lib/server/referrals/points';

const Body = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  // Admin's free-text note from the verification fiche — optional, only
  // meaningful for REJECT (surfaced to the user in their notification so
  // they know what to fix before resubmitting).
  reason: z.string().trim().max(500).optional(),
});

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
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const profile = await prisma.profile.findUnique({
      where: { id },
      include: { user: { select: { id: true, referredByAffiliateId: true } } },
    });
    if (!profile) {
      return NextResponse.json(
        { error: 'PROFILE_NOT_FOUND', message: 'Profile not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (profile.verificationStatus !== 'PENDING') {
      return NextResponse.json(
        { profile },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const approve = parsed.data.action === 'APPROVE';

    const updated = await prisma.$transaction(async (tx) => {
      const updatedProfile = await tx.profile.update({
        where: { id },
        data: {
          verificationStatus: approve ? 'VERIFIED' : 'REJECTED',
          // Either outcome closes out the submission: drop the selfie and
          // clear the code. On REJECT the user redoes it from scratch — the
          // /app/verification GET issues a fresh code and they write that
          // new one on the paper, so a resubmitted selfie is provably new.
          verificationSelfieKey: null,
          verificationCode: null,
          ...(approve
            ? { verifiedAt: new Date(), verificationRejectionReason: null }
            : { verificationRejectionReason: parsed.data.reason ?? null }),
        },
      });

      // Referral verification bonus — approve-only, and only when this
      // profile's account was referred. Never runs on REJECT. Branches by
      // the referrer's role (2026-08-31): an AFFILIATE-role referrer keeps
      // earning real FCFA (unchanged cash program below); any other
      // referrer — a regular user who shared their own link — earns
      // REFERRAL_POINTS_PER_VERIFICATION points instead, capped at
      // REFERRAL_MONTHLY_CAP rewarded referrals per calendar month. The two
      // paths are mutually exclusive — never both for the same event.
      if (approve && profile.user.referredByAffiliateId) {
        const referrer = await tx.user.findUnique({
          where: { id: profile.user.referredByAffiliateId },
          select: { id: true, role: true },
        });

        if (referrer?.role === 'AFFILIATE') {
          const existingBonus = await tx.affiliateEarning.findFirst({
            where: { referredUserId: profile.userId, type: 'VERIFICATION_BONUS' },
            select: { id: true },
          });
          if (!existingBonus) {
            // Postgres partial-unique-index failsafe (see migration
            // "AffiliateEarning_one_verification_bonus_per_user") — a
            // concurrent request may have already inserted the bonus
            // between our findFirst above and this insert. A
            // unique-constraint violation on Postgres aborts the WHOLE
            // transaction (25P02), which a JS try/catch around `.create()`
            // cannot undo inside an interactive Prisma transaction (no
            // savepoints between statements) — the next statement
            // (logAdminAction below) would itself throw and roll back the
            // profile's legitimate verification too.
            // `createMany({ skipDuplicates: true })` compiles to
            // `INSERT ... ON CONFLICT DO NOTHING`, so it never raises on
            // the partial-unique-index conflict and no catch is needed.
            await tx.affiliateEarning.createMany({
              data: [
                {
                  affiliateId: referrer.id,
                  referredUserId: profile.userId,
                  type: 'VERIFICATION_BONUS',
                  amount: profile.gender === 'FEMME' ? 90 : 30,
                },
              ],
              skipDuplicates: true,
            });
          }
        } else if (referrer) {
          const monthStart = new Date(
            Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
          );
          const bonusesThisMonth = await tx.referralBonus.count({
            where: { referrerId: referrer.id, createdAt: { gte: monthStart } },
          });
          if (bonusesThisMonth < REFERRAL_MONTHLY_CAP) {
            // Same skipDuplicates rationale as the AFFILIATE branch above —
            // ReferralBonus.referredUserId carries a full unique
            // constraint, so a concurrent duplicate resolves as count: 0
            // instead of throwing.
            const inserted = await tx.referralBonus.createMany({
              data: [
                {
                  referrerId: referrer.id,
                  referredUserId: profile.userId,
                  points: REFERRAL_POINTS_PER_VERIFICATION,
                },
              ],
              skipDuplicates: true,
            });
            if (inserted.count === 1) {
              const updated = await tx.user.update({
                where: { id: referrer.id },
                data: { referralPoints: { increment: REFERRAL_POINTS_PER_VERIFICATION } },
                select: { referralPoints: true },
              });
              const creditsToGrant = Math.floor(
                updated.referralPoints / REFERRAL_POINTS_PER_CREDIT,
              );
              if (creditsToGrant > 0) {
                await tx.user.update({
                  where: { id: referrer.id },
                  data: { referralPoints: updated.referralPoints % REFERRAL_POINTS_PER_CREDIT },
                });
                await grantCredits(tx, {
                  userId: referrer.id,
                  amount: creditsToGrant,
                  type: 'REFERRAL_CONVERSION',
                  action: 'referral_points_conversion',
                });
              }
            }
          }
        }
      }

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: approve ? 'profile.verify' : 'profile.reject',
        targetType: 'Profile',
        targetId: id,
        metadata: {
          userId: profile.userId,
          ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
        },
      });

      return updatedProfile;
    });

    await createNotification(
      prisma,
      approve
        ? profileVerified(profile.userId, id)
        : profileRejected(profile.userId, id, parsed.data.reason),
    );

    return NextResponse.json(
      { profile: updated },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
