// ADMIN — PATCH /api/admin/users/[id]/premium
//
// Lets an ADMIN directly grant or revoke Premium on any account without
// going through Chariow checkout (2026-08-17, explicit user ask: "activer
// directement en premium... pour me permettre de tester l'interface
// premium"). A grant creates/updates a Subscription row tagged
// provider: 'admin-grant' so it's clearly distinguishable in the DB and in
// /api/admin/audit-log from a real payment — nothing here touches Order
// rows or the payment provider. Mirrors the status route's PATCH-with-
// target-state shape and same-state no-op (skips AdminAction to avoid
// audit-log noise, per T-03-06-08).
//
// Sequence:
//   makeRequestContext → withRequestContext →
//     verifyCsrf → requireAdmin('ADMIN') → enforceAdminRateLimit →
//     Zod parse → prisma.$transaction(find → upsert Subscription → logAdminAction)
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

const ADMIN_GRANT_PLAN_ID = '6m';
const ADMIN_GRANT_PROVIDER = 'admin-grant';
const ADMIN_GRANT_DAYS = 180;

const Body = z.object({ status: z.enum(['ACTIVE', 'CANCELLED']) });

type Discriminator =
  | { kind: 'NOT_FOUND' }
  | {
      kind: 'OK';
      subscription: { status: string; provider: string; currentPeriodEnd: Date | null };
    };

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const result: Discriminator = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id }, select: { id: true } });
      if (!target) return { kind: 'NOT_FOUND' as const };

      const existing = await tx.subscription.findFirst({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
      });

      // Idempotent no-op: already in the requested state → skip the write
      // and the AdminAction entirely (matches the status route's convention).
      if (existing?.status === parsed.data.status) {
        return {
          kind: 'OK' as const,
          subscription: {
            status: existing.status,
            provider: existing.provider,
            currentPeriodEnd: existing.currentPeriodEnd,
          },
        };
      }

      let subscription;
      if (parsed.data.status === 'ACTIVE') {
        const currentPeriodEnd = new Date(Date.now() + ADMIN_GRANT_DAYS * 24 * 60 * 60 * 1000);
        subscription = existing
          ? await tx.subscription.update({
              where: { id: existing.id },
              data: {
                status: 'ACTIVE',
                planId: ADMIN_GRANT_PLAN_ID,
                provider: ADMIN_GRANT_PROVIDER,
                currentPeriodEnd,
                cancelAtPeriodEnd: false,
              },
            })
          : await tx.subscription.create({
              data: {
                userId: id,
                planId: ADMIN_GRANT_PLAN_ID,
                status: 'ACTIVE',
                provider: ADMIN_GRANT_PROVIDER,
                currentPeriodEnd,
              },
            });
      } else {
        // Revoke: nothing to cancel if the user was never subscribed.
        if (!existing) {
          return {
            kind: 'OK' as const,
            subscription: {
              status: 'CANCELLED',
              provider: ADMIN_GRANT_PROVIDER,
              currentPeriodEnd: null,
            },
          };
        }
        subscription = await tx.subscription.update({
          where: { id: existing.id },
          data: { status: 'CANCELLED', cancelAtPeriodEnd: true },
        });
      }

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: parsed.data.status === 'ACTIVE' ? 'user.premium_grant' : 'user.premium_revoke',
        targetType: 'User',
        targetId: id,
        metadata: {
          from: existing?.status ?? null,
          to: parsed.data.status,
          provider: subscription.provider,
        },
      });

      return {
        kind: 'OK' as const,
        subscription: {
          status: subscription.status,
          provider: subscription.provider,
          currentPeriodEnd: subscription.currentPeriodEnd,
        },
      };
    });

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return NextResponse.json(
      {
        subscription: {
          status: result.subscription.status,
          provider: result.subscription.provider,
          currentPeriodEnd: result.subscription.currentPeriodEnd?.toISOString() ?? null,
        },
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
