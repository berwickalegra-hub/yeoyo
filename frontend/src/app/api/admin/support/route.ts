// GET /api/admin/support — the Admin Panel "Support" inbox: one row per end
// user who has ever messaged support, most-recently-active first, with a
// last-message preview and an unread count (SupportMessage rows the user
// sent that no admin has opened yet — see SupportMessage.readByAdminAt).
//
// SupportMessage has no separate "thread" wrapper (mirrors CoachMessage's
// flat-per-user design, see schema.prisma) — so unlike /api/conversations
// (which sorts its own Conversation rows by a denormalized lastMessageAt),
// this groups the flat message table by userId first. That's a different
// query shape than the cursorWhere()/buildPage() helper (built for a flat
// row list, not a grouped aggregate), so this uses simple page/limit
// pagination instead — acceptable at a support inbox's expected scale.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function clampLimit(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
}

function clampPage(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('MODERATOR');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const page = clampPage(url.searchParams.get('page'));

    const [grouped, totalGroups, unreadThreads] = await Promise.all([
      prisma.supportMessage.groupBy({
        by: ['userId'],
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: 'desc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supportMessage.groupBy({ by: ['userId'] }).then((rows) => rows.length),
      // Distinct users with at least one unread (USER-sent, un-opened)
      // message — drives AdminSidebar's badge, independent of the current
      // page (a thread on page 2 with unread messages must still count).
      prisma.supportMessage
        .groupBy({ by: ['userId'], where: { senderRole: 'USER', readByAdminAt: null } })
        .then((rows) => rows.length),
    ]);

    const userIds = grouped.map((g) => g.userId);
    if (userIds.length === 0) {
      return NextResponse.json(
        { items: [], page, totalGroups, unreadThreads },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [users, recentMessages, unreadCounts] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true, avatarUrl: true },
      }),
      prisma.supportMessage.findMany({
        where: { userId: { in: userIds } },
        orderBy: { createdAt: 'desc' },
        select: { userId: true, content: true, senderRole: true, createdAt: true },
      }),
      prisma.supportMessage.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, senderRole: 'USER', readByAdminAt: null },
        _count: { id: true },
      }),
    ]);

    const usersById = new Map(users.map((u) => [u.id, u]));
    const lastMessageByUser = new Map<string, (typeof recentMessages)[number]>();
    for (const m of recentMessages) {
      if (!lastMessageByUser.has(m.userId)) lastMessageByUser.set(m.userId, m);
    }
    const unreadByUser = new Map(unreadCounts.map((u) => [u.userId, u._count.id]));

    const items = grouped
      .map((g) => {
        const user = usersById.get(g.userId);
        if (!user) return null;
        const lastMessage = lastMessageByUser.get(g.userId);
        return {
          userId: g.userId,
          user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
          lastMessage: lastMessage
            ? {
                content: lastMessage.content,
                senderRole: lastMessage.senderRole,
                createdAt: lastMessage.createdAt.toISOString(),
              }
            : null,
          unreadCount: unreadByUser.get(g.userId) ?? 0,
          lastActivityAt: (g._max.createdAt ?? new Date(0)).toISOString(),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return NextResponse.json(
      { items, page, totalGroups, unreadThreads },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
