// POST /api/push/subscribe   — register (upsert) this browser's push endpoint.
// DELETE /api/push/subscribe — remove it (scoped to the caller).
// The client sends `PushSubscription.toJSON()` shape: { endpoint, keys:{p256dh,auth} }.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
const UnsubscribeBody = z.object({ endpoint: z.string().min(1) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = SubscribeBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'Invalid subscription' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { endpoint, keys } = parsed.data;
    const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 255) || null;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: auth.user.sub, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      update: { userId: auth.user.sub, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    });

    return NextResponse.json(
      { ok: true },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = UnsubscribeBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { code: 'VALIDATION_FAILED', message: 'endpoint is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, userId: auth.user.sub },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
