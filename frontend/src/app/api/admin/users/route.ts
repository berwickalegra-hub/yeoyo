// ADMIN-01 — GET /api/admin/users (list with q + status + role + country +
// verification filters, cursor pagination).
//
// Sequence (Phase 3 RESEARCH.md Pattern 1, "admin-read"):
//   makeRequestContext → withRequestContext →
//     requireAdmin('ADMIN') (D-ADMIN-03 — ADMIN suffices for PII reads) →
//     enforceAdminRateLimit(auth.admin.id) (D-ADMIN-05 — 100/min/userId) →
//     parse ?q ?status ?role ?country ?verification ?withCounts ?cursor ?limit →
//     prisma.user.findMany(take=limit+1, orderBy createdAt DESC, id DESC) →
//     buildPage → return { items, nextCursor, counts? }
//
// `status` accepts ACTIVE | SUSPENDED (User.status) plus the pseudo-value
// HELD → profiles under a moderation hold (Profile.moderationHeldAt set).
// `verification` maps to Profile.verificationStatus. `country` is an ISO2
// match on Profile.country. `withCounts=1` adds a `counts` object with the
// Membres screen's tab totals — GLOBAL totals, deliberately ignoring the
// active filters (so a tab always shows how many members it *would* hold).
//
// PII whitelist: USER_SELECT excludes passwordHash / withdrawalPinHash /
// tokenVersion (T-03-02-02 — info-disclosure mitigation). The admin UI
// only needs identity + role + status + verification + country + createdAt.
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

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  creditBalance: true,
  createdAt: true,
  // Ville, for the admin dashboard's "Membres récents" table (Banani
  // AdminDashboard.jsx) — profile is optional (onboarding not required
  // before this point), so this can legitimately be null. `firstName` /
  // `country` / `verificationStatus` / `verifiedAt` / `moderationHeldAt`
  // feed the Membres screen's identity column, country column and the
  // Vérification / Statut badges.
  profile: {
    select: {
      commune: true,
      city: true,
      firstName: true,
      country: true,
      verificationStatus: true,
      verifiedAt: true,
      moderationHeldAt: true,
    },
  },
} as const satisfies Prisma.UserSelect;

const Q_MAX = 200;
const VERIFICATION_VALUES = ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'] as const;

// Tab totals for the Membres screen — global counts, independent of the
// active filter set (each tab shows the size of the bucket it opens).
async function countTabs(): Promise<{
  all: number;
  verified: number;
  pending: number;
  unverified: number;
  rejected: number;
  suspended: number;
  held: number;
}> {
  const [all, verified, pending, unverified, rejected, suspended, held] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { profile: { verificationStatus: 'VERIFIED' } } }),
    prisma.user.count({ where: { profile: { verificationStatus: 'PENDING' } } }),
    prisma.user.count({ where: { profile: { verificationStatus: 'UNVERIFIED' } } }),
    prisma.user.count({ where: { profile: { verificationStatus: 'REJECTED' } } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.user.count({ where: { profile: { moderationHeldAt: { not: null } } } }),
  ]);
  return { all, verified, pending, unverified, rejected, suspended, held };
}

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
    const country = (url.searchParams.get('country') ?? '').trim().toUpperCase().slice(0, 2);
    const verificationParam = (url.searchParams.get('verification') ?? '').trim().toUpperCase();
    const verification = (VERIFICATION_VALUES as readonly string[]).includes(verificationParam)
      ? verificationParam
      : null;
    const withCounts = url.searchParams.get('withCounts') === '1';
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    // `status=HELD` is not a User.status — it means "profile currently under
    // a moderation hold". ACTIVE / SUSPENDED stay a direct User.status match.
    const heldFilter = status === 'HELD';
    const userStatus = status === 'ACTIVE' || status === 'SUSPENDED' ? status : null;

    // Profile is a to-one optional relation; a nested filter here also means
    // "has a profile", which is the right behaviour — you can't filter by a
    // country / verification state a profile-less account doesn't have.
    const profileWhere: Prisma.ProfileWhereInput = {
      ...(country ? { country } : {}),
      ...(verification ? { verificationStatus: verification } : {}),
      ...(heldFilter ? { moderationHeldAt: { not: null } } : {}),
    };

    const where: Prisma.UserWhereInput = {
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(userStatus ? { status: userStatus } : {}),
      // `{ in: [x] }` and `{ role: x }` are equivalent for a single value,
      // so one branch covers both the pre-existing single-role callers and
      // the new multi-role case (/admin/roles needs MODERATOR+ADMIN+SUPERADMIN).
      ...(roles.length > 0 ? { role: { in: roles } } : {}),
      ...(Object.keys(profileWhere).length > 0 ? { profile: profileWhere } : {}),
      ...cursorWhere(cursor),
    };

    const [rows, counts] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: USER_SELECT,
      }),
      withCounts ? countTabs() : Promise.resolve(null),
    ]);

    const page = buildPage(rows, limit);
    return NextResponse.json(
      {
        ...page,
        items: page.items.map(({ profile, ...u }) => ({
          ...u,
          city: profile?.commune ?? profile?.city ?? null,
          firstName: profile?.firstName ?? null,
          country: profile?.country ?? null,
          verificationStatus: profile?.verificationStatus ?? 'UNVERIFIED',
          verified: !!profile?.verifiedAt,
          held: !!profile?.moderationHeldAt,
        })),
        ...(counts ? { counts } : {}),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
