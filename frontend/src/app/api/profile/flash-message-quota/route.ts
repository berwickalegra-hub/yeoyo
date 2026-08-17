// POST /api/profile/flash-message-quota — atomically checks and consumes
// one use of the free "Message" shortcut on Découvrir's swipe card (see
// lib/server/conversations/flash-message-quota.ts for the full rationale).
// Called by SwipeCard BEFORE it opens the conversation; the client only
// proceeds when `allowed: true` comes back, otherwise it shows
// PremiumGateModal instead.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { consumeFlashMessageQuota } from '@/lib/server/conversations/flash-message-quota';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const result = await consumeFlashMessageQuota(prisma, auth.user.sub);
    return NextResponse.json(result, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
