// POST /api/webhooks/chariow?secret=... — Chariow "Pulse" webhook.
//
// Chariow has no request signature; its only integrity mechanism is a
// shared secret in the URL query string (Chariow.md §7). That secret is
// checked HERE, before the generic webhook factory
// (lib/server/webhook/handler.ts, PROTECTED) ever runs — the
// WebhookProvider's own `verifySignature` always returns valid, which is
// only safe because this gate already ran.
//
// Zero trust in the body: `onPaid` reads ONLY the sale id from the
// payload and defers all crediting to `reconcileChariowOrder`, which
// re-pulls the real status from Chariow's API. It runs as a `postCommit`
// hook (AFTER the factory's own Serializable transaction commits the
// WebhookLog dedup row) rather than inside that transaction, so a slow
// Chariow API call never holds the dedup transaction open.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createWebhookHandler } from '@/lib/server/webhook/handler';
import { chariowWebhookProvider, type ChariowWebhookPayload } from '@/lib/server/payments/chariow';
import { reconcileChariowOrder } from '@/lib/server/subscriptions/reconcile';
import { prisma } from '@/lib/server/prisma';

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const chariowHandler = createWebhookHandler<ChariowWebhookPayload>({
  prisma,
  provider: chariowWebhookProvider,

  async onPaid(payload) {
    const saleId = String(payload.data?.id ?? payload.data?.sale_id ?? '');
    if (!saleId) return {};
    return {
      postCommit: async () => {
        const order = await prisma.order.findFirst({ where: { providerChargeId: saleId } });
        if (order) await reconcileChariowOrder(prisma, order.id);
      },
    };
  },
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.nextUrl.searchParams.get('secret') ?? '';
  const expected = process.env.CHARIOW_WEBHOOK_SECRET ?? '';
  if (!expected || !timingSafeStringEqual(secret, expected)) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }
  return chariowHandler(req);
}
