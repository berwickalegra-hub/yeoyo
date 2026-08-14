// ADMIN-05 (D-ADMIN-04) — Admin probe endpoint.
//
// Returns the authenticated admin's role + a static capability list keyed
// by role. Front-ends use the `can` array to render conditional UI
// (e.g. show the "Cancel Withdrawal" button only when 'withdrawals:cancel'
// is present). The list is informational ONLY — every mutating route
// re-checks role server-side via `requireAdmin('SUPERADMIN')` etc., so a
// client that lies about its capabilities cannot escalate.
//
// Threat T-03-03-03 disposition (mitigate): server still gates each
// mutating route independently; capability list is presentational hint.
//
// Threat T-03-03-04 disposition (mitigate): per-userId rate limit applies
// here too, so a polling UI cannot burn the back-office budget.
//
// CAPABILITY LIST CONTRACT (D-ADMIN-04 — locked):
//   MODERATOR sees 4: verification-queue:read, verification-queue:process,
//     reports:read, reports:resolve.
//   ADMIN sees 8 capabilities: users:read, users:status:suspend,
//     orders:read, withdrawals:read, audit-log:read, outbox:read,
//     email-queue:read, rate-limits:read.
//   SUPERADMIN sees 13: same 8 + users:role + users:status:restore +
//     withdrawals:cancel + admin:invite + admin:revoke.
//
// Front-end teams can pivot off this shape; changing the list is a
// breaking change to the back-office UI.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CAPABILITIES_BY_ROLE: Record<'MODERATOR' | 'ADMIN' | 'SUPERADMIN', readonly string[]> = {
  MODERATOR: [
    'verification-queue:read',
    'verification-queue:process',
    'reports:read',
    'reports:resolve',
  ],
  ADMIN: [
    'users:read',
    'users:status:suspend',
    'orders:read',
    'withdrawals:read',
    'audit-log:read',
    'outbox:read',
    'email-queue:read',
    'rate-limits:read',
  ],
  SUPERADMIN: [
    'users:read',
    'users:role',
    'users:status:suspend',
    'users:status:restore',
    'orders:read',
    'withdrawals:read',
    'withdrawals:cancel',
    'audit-log:read',
    'outbox:read',
    'email-queue:read',
    'rate-limits:read',
    'admin:invite',
    'admin:revoke',
  ],
} as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('MODERATOR');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    // requireAdmin('MODERATOR') has already filtered USER away (returns
    // 403), so narrow the role type for the capability-list lookup. The
    // runtime contract is enforced by `requireAdmin`; this cast just
    // teaches TS.
    const role = auth.admin.role as 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';

    return NextResponse.json(
      {
        admin: {
          id: auth.admin.id,
          email: auth.admin.email,
          role,
        },
        can: CAPABILITIES_BY_ROLE[role],
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
