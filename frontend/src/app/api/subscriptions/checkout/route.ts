// POST /api/subscriptions/checkout — starts a real Chariow-backed Premium
// subscription purchase. Creates an Order (provider="chariow") + a PENDING
// Subscription, calls Chariow to create a hosted checkout, and redirects
// the client to Chariow's `checkout_url`. Confirmation never happens here
// — it happens in reconcileChariowOrder (lib/server/subscriptions/reconcile.ts),
// triggered by the user-return poll, the webhook, or the safety-net cron.
export const runtime = 'nodejs';
// chariow.ts's own outbound HTTP timeout is 30s; the function must outlive
// it, otherwise a slow-but-successful Chariow call gets killed mid-flight
// AFTER Chariow already created a real charge and we never record the sale id.
export const maxDuration = 40;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getPlan } from '@/lib/server/subscriptions/plans';
import { reconcileChariowOrder } from '@/lib/server/subscriptions/reconcile';
import { charge, resolveChariowPhone, getChariowProductId } from '@/lib/server/payments/chariow';
import {
  getChariowEnv,
  chariowBreaker,
  ChariowProviderUnconfiguredError,
} from '@/lib/server/payments/chariow-singleton';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();

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
    // A PENDING Subscription must NEVER become a permanent lock-out. Nothing
    // else in the codebase transitions a Subscription out of PENDING except
    // reconcileChariowOrder, so an abandoned checkout would otherwise leave
    // the user replaying a dead paymentUrl forever — for any plan they pick.
    if (existing?.status === 'PENDING' && existing.order) {
      const staleOrder = existing.order;

      // Force a fresh pull from Chariow. This doubles as a fourth,
      // synchronous confirmation opportunity: if the abandoned attempt did
      // settle, the user gets ALREADY_SUBSCRIBED instead of paying twice.
      let reconciledOrderStatus = staleOrder.status;
      try {
        const reconciled = await reconcileChariowOrder(prisma, staleOrder.id);
        if (reconciled.subscriptionStatus === 'ACTIVE') {
          return NextResponse.json(
            { code: 'ALREADY_SUBSCRIBED', message: 'You already have an active subscription' },
            { status: 409, headers: { 'x-request-id': ctx.requestId } },
          );
        }
        reconciledOrderStatus = reconciled.orderStatus;
      } catch (err) {
        // Chariow unreachable / unconfigured — fall back to locally-known
        // state rather than 500-ing the whole checkout. The cron will retry.
        log.warn('checkout: reconcile of the previous PENDING attempt failed', {
          orderId: staleOrder.id,
          err: String(err),
        });
      }

      const stillLive =
        reconciledOrderStatus === 'PENDING' &&
        !!staleOrder.paymentUrl &&
        !!staleOrder.expiresAt &&
        staleOrder.expiresAt > new Date();

      if (stillLive && existing.planId === parsed.data.planId) {
        return NextResponse.json(
          { orderId: staleOrder.id, paymentUrl: staleOrder.paymentUrl, status: 'PENDING' },
          { status: 200, headers: { 'x-request-id': ctx.requestId } },
        );
      }

      // Stale, expired, or the user picked a different plan — supersede the
      // dangling Subscription (compare-and-swap guarded, same idempotency
      // pattern used elsewhere) and fall through to a brand-new checkout.
      const supersedeCas = await prisma.subscription.updateMany({
        where: { id: existing.id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });

      if (supersedeCas.count === 0) {
        // Lost the race: a concurrent request (double-click, two open tabs)
        // already resolved this Subscription between our read above and
        // this write. Falling through here would create a second, real
        // Chariow charge for the same abandoned attempt. Stop and ask the
        // client to retry — the next request will see whatever the winning
        // request left behind and take the correct branch above.
        return NextResponse.json(
          {
            code: 'CHECKOUT_IN_PROGRESS',
            message: 'Une autre tentative de paiement est déjà en cours, réessaie dans un instant',
          },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    // Fail closed when PUBLIC_URL is unset in production — mirrors WR-06 in
    // api/orders/route.ts. The redirect_url handed to Chariow is baked into
    // the hosted checkout; a forgotten PUBLIC_URL env var means a real
    // charge redirects the buyer's phone to http://localhost:3000 after
    // payment (unreachable), and since the webhook is a separate, easy-to-
    // miss manual setup step in Chariow's own dashboard, a misconfigured
    // deploy could otherwise go undetected until the daily reconcile cron.
    const envPublicUrl = process.env.PUBLIC_URL;
    if (!envPublicUrl && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          code: 'PAYMENT_PROVIDER_UNCONFIGURED',
          message: 'PUBLIC_URL not set; cannot construct the Chariow redirect URL.',
        },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const publicUrl = envPublicUrl ?? 'http://localhost:3000';

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

    // Persist the sale id FIRST, on its own, before anything else. Chariow
    // has already created a real charge at this point; if this write were
    // bundled with the two below, a failure in either would lose the
    // providerChargeId and with it every chance of ever reconciling the
    // payment. `amount`/`currency` are overwritten with Chariow's own
    // checkout-time figures on purpose (never hardcode the local currency —
    // Chariow.md §3.1); the anti-fraud reference stays the plan price, which
    // reconcile.ts reads from getPlan(), not from this row.
    await prisma.order.update({
      where: { id: order.id },
      data: {
        providerChargeId: chargeResult.saleId,
        paymentUrl: chargeResult.checkoutUrl,
        amount: chargeResult.amount,
        currency: chargeResult.currency,
      },
    });

    await prisma.$transaction([
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
