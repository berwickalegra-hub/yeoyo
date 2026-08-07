// POST /api/reports — file a report against another user. No Banani screen
// actually exposes a "Signaler" trigger (only the Admin Panel's review side
// was designed) — wired into the Messages thread's action row alongside
// "Bloquer" so the Admin Panel's Signalements queue has a real source.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  targetUserId: z.string(),
  reason: z.enum(['FAKE_PROFILE', 'INAPPROPRIATE_CONTENT', 'HARASSMENT', 'SCAM', 'OTHER']),
  details: z.string().trim().max(1000).optional(),
});

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
    const { targetUserId, reason, details } = parsed.data;

    if (targetUserId === auth.user.sub) {
      return NextResponse.json(
        { code: 'CANNOT_REPORT_SELF', message: 'Cannot report yourself' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json(
        { code: 'USER_NOT_FOUND', message: 'Target user not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const report = await prisma.report.create({
      data: {
        reporterId: auth.user.sub,
        targetId: targetUserId,
        reason,
        ...(details ? { details } : {}),
      },
      select: { id: true },
    });

    return NextResponse.json(
      { id: report.id },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
