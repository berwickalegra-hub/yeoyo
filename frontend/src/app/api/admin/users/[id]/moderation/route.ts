// POST /api/admin/users/[id]/moderation — put a member's profile "en retrait"
// (soft-hide) or release it. Distinct from /status (which SUSPENDS the whole
// account / blocks login). See lib/server/moderation/hold.ts.
//
// Gated at MODERATOR — this is day-to-day content moderation, same tier as
// the verification queue and reports.
//
// HOLD  → sets Profile.moderationHeldAt + moderationReason, and posts an
//         Équipe YeOyo (SupportMessage senderRole=ADMIN) message with the
//         reason + fix instructions — all in one transaction.
// RELEASE → clears both fields and posts a "your profile is live again" note.
//
// Audit metadata:
//   profile.hold:    { reason }
//   profile.release: { previousReason? }
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
import { holdNoticeMessage, releaseNoticeMessage } from '@/lib/server/moderation/hold';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('HOLD'), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal('RELEASE') }),
]);

type Result =
  | { kind: 'USER_NOT_FOUND' }
  | { kind: 'PROFILE_NOT_FOUND' }
  | { kind: 'NOOP'; held: boolean }
  | { kind: 'OK'; held: boolean; reason: string | null };

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
        { error: 'VALIDATION_FAILED', message: 'action must be HOLD (with reason) or RELEASE' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const input = parsed.data;

    const result: Result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!user) return { kind: 'USER_NOT_FOUND' };

      const profile = await tx.profile.findUnique({
        where: { userId: id },
        select: { id: true, moderationHeldAt: true, moderationReason: true },
      });
      if (!profile) return { kind: 'PROFILE_NOT_FOUND' };

      const currentlyHeld = !!profile.moderationHeldAt;

      // Idempotent no-op — nothing to write, no message, no audit noise.
      if (input.action === 'HOLD' && currentlyHeld) return { kind: 'NOOP', held: true };
      if (input.action === 'RELEASE' && !currentlyHeld) return { kind: 'NOOP', held: false };

      if (input.action === 'HOLD') {
        await tx.profile.update({
          where: { userId: id },
          data: { moderationHeldAt: new Date(), moderationReason: input.reason },
        });
        await tx.supportMessage.create({
          data: {
            userId: id,
            senderRole: 'ADMIN',
            senderId: auth.admin.id,
            content: holdNoticeMessage(input.reason),
          },
        });
        await logAdminAction(tx, {
          actorId: auth.admin.id,
          action: 'profile.hold',
          targetType: 'Profile',
          targetId: id,
          metadata: { reason: input.reason },
        });
        return { kind: 'OK', held: true, reason: input.reason };
      }

      // RELEASE
      await tx.profile.update({
        where: { userId: id },
        data: { moderationHeldAt: null, moderationReason: null },
      });
      await tx.supportMessage.create({
        data: {
          userId: id,
          senderRole: 'ADMIN',
          senderId: auth.admin.id,
          content: releaseNoticeMessage(),
        },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'profile.release',
        targetType: 'Profile',
        targetId: id,
        metadata: profile.moderationReason ? { previousReason: profile.moderationReason } : {},
      });
      return { kind: 'OK', held: false, reason: null };
    });

    if (result.kind === 'USER_NOT_FOUND' || result.kind === 'PROFILE_NOT_FOUND') {
      return NextResponse.json(
        { error: result.kind, message: 'Member or profile not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        moderation: {
          held: result.held,
          reason: result.kind === 'OK' ? result.reason : null,
          noop: result.kind === 'NOOP',
        },
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
