// GET /api/realtime/status — cheap, always-200 "is Ably configured" check.
//
// Split out from POST /api/realtime/token (2026-08-29, explicit user
// report): lib/yeoyo/ably-safe-close.ts's isRealtimeConfigured() used to
// probe configuration by POSTing to the token-mint route itself, so every
// page load without ABLY_API_KEY set surfaced a genuine-looking
// "503 (Service Unavailable)" in the browser console — technically correct
// (Ably really is unconfigured) but alarming to look at for something the
// app already degrades from gracefully. This route answers the exact same
// question (`!!process.env.ABLY_API_KEY`) without ever needing to fail.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    return NextResponse.json(
      { configured: !!process.env.ABLY_API_KEY },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
