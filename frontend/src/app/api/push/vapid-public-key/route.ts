// GET /api/push/vapid-public-key — the client needs the public VAPID key to
// call pushManager.subscribe(). Served here (not NEXT_PUBLIC_*) so a key
// rotation needs no rebuild and "is push configured" has one server-side
// source of truth. Returns null when push is not configured.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { isPushConfigured } from '@/lib/server/push';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    return NextResponse.json(
      { publicKey: isPushConfigured() ? (process.env.VAPID_PUBLIC_KEY as string) : null },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
