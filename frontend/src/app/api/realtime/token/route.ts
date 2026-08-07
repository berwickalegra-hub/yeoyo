// POST /api/realtime/token
//
// Mints an Ably capability token scoped to the caller so the client can
// subscribe/publish on their conversation channels without ever seeing the
// Ably API key. See CLAUDE.md's real-time provider recommendation — Vercel
// functions can't hold long-lived WebSocket/SSE connections, so all
// messaging traffic goes through Ably's REST API + client SDK instead.
//
export const runtime = 'nodejs';

import 'server-only';
import Ably, { type capabilityOp } from 'ably';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    if (!process.env.ABLY_API_KEY) {
      log.warn('Ably not configured — /api/realtime/token is inert (set ABLY_API_KEY)');
      return NextResponse.json(
        { code: 'REALTIME_NOT_CONFIGURED', message: 'Realtime not configured' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Scope capability to only the conversations the caller actually
    // participates in — never a `conversation:*` wildcard, which would let
    // any authenticated user subscribe to (or publish into) every thread.
    const conversations = await prisma.conversation.findMany({
      where: { OR: [{ userAId: auth.user.sub }, { userBId: auth.user.sub }] },
      select: { id: true },
    });
    const capability: Record<string, capabilityOp[]> = {};
    for (const c of conversations) {
      capability[`conversation:${c.id}`] = ['subscribe', 'publish', 'presence'];
    }

    const client = new Ably.Rest(process.env.ABLY_API_KEY);
    const tokenRequest = await client.auth.createTokenRequest({
      clientId: auth.user.sub,
      capability,
    });

    return NextResponse.json(tokenRequest, {
      status: 200,
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}
