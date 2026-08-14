/**
 * App-wide role hierarchy used by the admin back-office.
 * Precedence: SUPERADMIN > ADMIN > MODERATOR > USER.
 *
 * MODERATOR is scoped to moderation + support surfaces (verification
 * queue, reports) — routes gate it explicitly via `requireAdmin('MODERATOR')`;
 * it does NOT inherit general ADMIN access to users/subscriptions/roles.
 *
 * The actual gate logic now lives in `./index.ts` (`requireAdmin`,
 * `requireSuperadmin`) — this file only exports the role type + rank
 * function so audit/route code can do role math without pulling in the
 * full middleware module.
 */
import 'server-only';

export type AdminRole = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';

const ROLE_RANK: Record<AdminRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPERADMIN: 3 };

export function roleRank(role: AdminRole): number {
  return ROLE_RANK[role] ?? 0;
}
