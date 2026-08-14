// GET /api/admin/reports — the Admin Panel "Signalements" panel. Cursor
// pagination + status filter (defaults to PENDING, the actionable queue).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('MODERATOR');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const status = url.searchParams.get('status') ?? 'PENDING';
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const [rows, total] = await Promise.all([
      prisma.report.findMany({
        where: { status, ...cursorWhere(cursor) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: {
          reporter: { select: { id: true, email: true, name: true } },
          target: { select: { id: true, email: true, name: true } },
        },
      }),
      prisma.report.count({ where: { status } }),
    ]);

    const page = buildPage(rows, limit);
    return NextResponse.json({ ...page, total }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
