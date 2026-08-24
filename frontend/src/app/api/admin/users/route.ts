// ADMIN-01 — GET /api/admin/users (list with q + status + role filters,
// cursor pagination).
//
// Sequence (Phase 3 RESEARCH.md Pattern 1, "admin-read"):
//   makeRequestContext → withRequestContext →
//     requireAdmin('ADMIN') (D-ADMIN-03 — ADMIN suffices for PII reads) →
//     enforceAdminRateLimit(auth.admin.id) (D-ADMIN-05 — 100/min/userId) →
//     parse ?q ?status ?role ?cursor ?limit →
//     prisma.user.findMany(take=limit+1, orderBy createdAt DESC, id DESC) →
//     buildPage → return { items, nextCursor }
//
// PII whitelist: USER_SELECT excludes passwordHash / withdrawalPinHash /
// tokenVersion (T-03-02-02 — info-disclosure mitigation). The admin UI
// only needs identity + role + status + createdAt.
//
// Empty result → 200 { items: [], nextCursor: null } per D-LIST-05 — never 404.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getPremiumUserIds } from '@/lib/server/subscriptions/premium-status';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  // Ville, for the admin dashboard's "Membres récents" table (Banani
  // AdminDashboard.jsx) — profile is optional (onboarding not required
  // before this point), so this can legitimately be null.
  profile: { select: { commune: true, city: true } },
} as const satisfies Prisma.UserSelect;

const Q_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const status = url.searchParams.get('status');
    // Comma-separated list of roles ("MODERATOR,ADMIN,SUPERADMIN") in
    // addition to the original single-role exact match — the /admin/roles
    // page needs "every admin-capable account", not one exact role, and a
    // list is the minimal addition that doesn't change behavior for any
    // existing single-value caller.
    const roleParam = url.searchParams.get('role');
    const roles = roleParam
      ? roleParam
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean)
      : [];
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const where: Prisma.UserWhereInput = {
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
      // `{ in: [x] }` and `{ role: x }` are equivalent for a single value,
      // so one branch covers both the pre-existing single-role callers and
      // the new multi-role case (/admin/roles needs MODERATOR+ADMIN+SUPERADMIN).
      ...(roles.length > 0 ? { role: { in: roles } } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: USER_SELECT,
    });

    const page = buildPage(rows, limit);
    const premiumIds = await getPremiumUserIds(
      prisma,
      page.items.map((u) => u.id),
    );
    return NextResponse.json(
      {
        ...page,
        items: page.items.map(({ profile, ...u }) => ({
          ...u,
          isPremium: premiumIds.has(u.id),
          city: profile?.commune ?? profile?.city ?? null,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
