// POST /api/subscriptions/checkout — starts a Premium subscription purchase.
// Creates an Order (provider="stub") + a PENDING Subscription in the same
// transaction, then hands back a `paymentUrl` pointing at the internal
// "pending" page (see lib/server/payments/stub.ts). No real money moves —
// this exists so the checkout UI can be built and tested end-to-end before
// a real Stripe/Moneroo charge is wired in (explicit user decision).
//
// Idempotency here is state-based, not header-based: unlike a real charge,
// re-submitting a stub checkout can't double-bill anyone, so we just avoid
// creating duplicate rows by returning the existing PENDING subscription's
// order instead of a fresh one. Once a real provider is wired, this route
// should adopt the same Idempotency-Key + CircuitBreaker pattern POST
// /api/orders uses — that protection matters once a charge is real.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getPlan } from '@/lib/server/subscriptions/plans';
import { createStubCharge } from '@/lib/server/payments/stub';

const Body = z.object({
  planId: z.enum(['monthly', 'semiannual', 'annual']),
  paymentMethod: z.enum(['M_PESA', 'AIRTEL_MONEY', 'ORANGE_MONEY']),
});

const CHECKOUT_EXPIRY_MS = 30 * 60 * 1000;

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
    const plan = getPlan(parsed.data.planId);
    if (!plan) {
      return NextResponse.json(
        { code: 'PLAN_NOT_FOUND', message: 'Unknown plan' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.subscription.findFirst({
      where: { userId: auth.user.sub, status: { in: ['PENDING', 'ACTIVE'] } },
      include: { order: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing?.status === 'ACTIVE') {
      return NextResponse.json(
        { code: 'ALREADY_SUBSCRIBED', message: 'You already have an active subscription' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (existing?.status === 'PENDING' && existing.order?.paymentUrl) {
      return NextResponse.json(
        { orderId: existing.order.id, paymentUrl: existing.order.paymentUrl, status: 'PENDING' },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const publicUrl = process.env.PUBLIC_URL ?? 'http://localhost:3000';

    const { orderId, paymentUrl } = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId: auth.user.sub,
          amount: plan.priceCentsTotal,
          currency: 'USD',
          provider: 'stub',
          status: 'PENDING',
          customerEmail: auth.user.email,
          paymentMethod: parsed.data.paymentMethod,
          expiresAt: new Date(Date.now() + CHECKOUT_EXPIRY_MS),
          metadata: { planId: plan.id },
        },
      });

      const charge = createStubCharge(publicUrl, order.id);
      await tx.order.update({
        where: { id: order.id },
        data: { providerChargeId: charge.providerChargeId, paymentUrl: charge.paymentUrl },
      });

      await tx.subscription.create({
        data: {
          userId: auth.user.sub,
          planId: plan.id,
          status: 'PENDING',
          provider: 'stub',
          orderId: order.id,
        },
      });

      return { orderId: order.id, paymentUrl: charge.paymentUrl };
    });

    return NextResponse.json(
      { orderId, paymentUrl, status: 'PENDING' },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
