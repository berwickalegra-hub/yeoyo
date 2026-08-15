// POST /api/subscriptions/checkout — starts a real Chariow-backed Premium
// subscription purchase. Creates an Order (provider="chariow") + a PENDING
// Subscription, calls Chariow to create a hosted checkout, and redirects
// the client to Chariow's `checkout_url`. Confirmation never happens here
// — it happens in reconcileChariowOrder (lib/server/subscriptions/reconcile.ts),
// triggered by the user-return poll, the webhook, or the safety-net cron.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getPlan } from '@/lib/server/subscriptions/plans';
import { charge, resolveChariowPhone, getChariowProductId } from '@/lib/server/payments/chariow';
import {
  getChariowEnv,
  chariowBreaker,
  ChariowProviderUnconfiguredError,
} from '@/lib/server/payments/chariow-singleton';

// No cross-field `.refine()` here on purpose: whether phone info is present
// enough to resolve is entirely `resolveChariowPhone`'s call, so an absent
// or incomplete phone always surfaces as the phone-specific 400 INVALID_PHONE
// below, never a generic 400 VALIDATION_FAILED.
const Body = z.object({
  planId: z.enum(['15j', '1m', '3m', '6m']),
  phone: z.string().min(6).optional(),
  phoneCountry: z.string().length(2).optional(),
  phoneLocal: z.string().min(4).optional(),
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

    // Built field-by-field (not `resolveChariowPhone(parsed.data)`) because
    // exactOptionalPropertyTypes forbids passing an explicit `undefined` for
    // an optional prop — Zod's inferred type includes `| undefined` on every
    // `.optional()` field, which a plain spread of `parsed.data` would carry
    // over even for absent fields.
    const resolvedPhone = resolveChariowPhone({
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone }),
      ...(parsed.data.phoneCountry !== undefined && { phoneCountry: parsed.data.phoneCountry }),
      ...(parsed.data.phoneLocal !== undefined && { phoneLocal: parsed.data.phoneLocal }),
    });
    if (!resolvedPhone) {
      return NextResponse.json(
        { code: 'INVALID_PHONE', message: 'Numéro de téléphone invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const productId = getChariowProductId(plan.id);
    let env;
    try {
      env = getChariowEnv();
    } catch (err) {
      if (err instanceof ChariowProviderUnconfiguredError) {
        return NextResponse.json(
          { code: 'PAYMENT_PROVIDER_UNCONFIGURED', message: err.message },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
    if (!productId) {
      return NextResponse.json(
        {
          code: 'PAYMENT_PROVIDER_UNCONFIGURED',
          message: `No Chariow product configured for plan ${plan.id}`,
        },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [profile, existing] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: auth.user.sub } }),
      prisma.subscription.findFirst({
        where: { userId: auth.user.sub, status: { in: ['PENDING', 'ACTIVE'] } },
        include: { order: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (!profile) {
      return NextResponse.json(
        { code: 'PROFILE_REQUIRED', message: 'Complete onboarding first' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
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

    const order = await prisma.order.create({
      data: {
        userId: auth.user.sub,
        amount: plan.priceUsdCentsTotal,
        currency: 'USD',
        provider: 'chariow',
        status: 'PENDING',
        customerEmail: auth.user.email,
        customerPhone: parsed.data.phone ?? null,
        expiresAt: new Date(Date.now() + CHECKOUT_EXPIRY_MS),
        metadata: { planId: plan.id },
      },
    });

    const redirectUrl = `${publicUrl}/app/premium/pending?orderId=${order.id}`;

    let chargeResult;
    try {
      chargeResult = await chariowBreaker.execute(() =>
        charge(env, {
          productId,
          email: auth.user.email,
          firstName: profile.firstName,
          lastName: profile.lastName ?? profile.firstName,
          phone: resolvedPhone,
          redirectUrl,
          metadata: { userId: auth.user.sub, planId: plan.id, orderId: order.id },
        }),
      );
    } catch {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      return NextResponse.json(
        { code: 'PROVIDER_ERROR', message: 'Impossible de créer le paiement Chariow' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: {
          providerChargeId: chargeResult.saleId,
          paymentUrl: chargeResult.checkoutUrl,
          amount: chargeResult.amount,
          currency: chargeResult.currency,
        },
      }),
      prisma.subscription.create({
        data: {
          userId: auth.user.sub,
          planId: plan.id,
          status: 'PENDING',
          provider: 'chariow',
          orderId: order.id,
        },
      }),
      prisma.profile.update({
        where: { userId: auth.user.sub },
        data: { phone: resolvedPhone.number, phoneCountry: resolvedPhone.countryCode },
      }),
    ]);

    return NextResponse.json(
      { orderId: order.id, paymentUrl: chargeResult.checkoutUrl, status: 'PENDING' },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
