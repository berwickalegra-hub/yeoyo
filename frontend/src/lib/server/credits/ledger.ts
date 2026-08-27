/**
 * The single choke point for every credit-balance mutation (same "always go
 * through this" convention CLAUDE.md already imposes on notifications via
 * createNotification). Two entry points:
 *
 *   spendCredits — atomic guarded decrement. Two concurrent spends can't
 *   both slip through on the last credit: `updateMany` with a
 *   `creditBalance: { gte: cost }` WHERE guard is a single UPDATE statement,
 *   inherently atomic per-row (same pattern as
 *   conversations/flash-message-quota.ts's CAS, simpler here since there's
 *   only one condition to guard, not a rolling-window reset too).
 *
 *   grantCredits — plain increment (purchases, admin grants). No guard
 *   needed; a grant can never fail for insufficient balance.
 *
 * ADMIN/SUPERADMIN bypass every cost entirely (2026-08-25, replaces the old
 * "admin accounts are always Premium" self-heal) — spendCredits short-
 * circuits before touching the DB at all when the caller's role is staff,
 * so no fake balance is ever written and the ledger stays free of
 * admin-preview noise. The UI shows "Illimité" for these roles instead of
 * a number (see CreditsContext / GET /api/credits/me).
 */
import 'server-only';
import type { Prisma } from '@prisma/client';

export type CreditsTxClient = Pick<Prisma.TransactionClient, 'user' | 'creditTransaction'>;

const STAFF_ROLES = new Set(['ADMIN', 'SUPERADMIN']);

/** Central per-action cost table — the only place a credit price is defined. */
export const CREDIT_COSTS = {
  view_visitors: 1,
  view_favorited_by: 1,
  boost: 3,
  first_message: 1,
  flash_message: 3,
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

// 2026-08-26 — one-time, non-renewable signup gift. Granted exactly once,
// at account-creation time (see signup/route.ts and the OAuth Google
// callback), never re-granted, never combined with a purchase beyond the
// same flat +5 landing in the same balance a purchase would land in — it's
// just an ordinary CreditTransaction row with its own `type` so the
// history (Paramètres > Paiement) can label it distinctly from a purchase.
export const WELCOME_GIFT_CREDITS = 5;

export interface SpendResult {
  ok: boolean;
  /** true when an ADMIN/SUPERADMIN bypassed the charge — no ledger row was written. */
  bypass: boolean;
  /** Balance after the attempt (bypass calls don't return a meaningful number). */
  balance: number;
}

export async function spendCredits(
  db: CreditsTxClient,
  { userId, action, role }: { userId: string; action: CreditAction; role?: string | null },
): Promise<SpendResult> {
  if (role && STAFF_ROLES.has(role)) {
    return { ok: true, bypass: true, balance: 0 };
  }

  const cost = CREDIT_COSTS[action];
  const cas = await db.user.updateMany({
    where: { id: userId, creditBalance: { gte: cost } },
    data: { creditBalance: { decrement: cost } },
  });

  if (cas.count === 0) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { creditBalance: true },
    });
    return { ok: false, bypass: false, balance: user?.creditBalance ?? 0 };
  }

  await db.creditTransaction.create({
    data: { userId, type: 'SPEND', amount: -cost, action },
  });
  const user = await db.user.findUnique({ where: { id: userId }, select: { creditBalance: true } });
  return { ok: true, bypass: false, balance: user?.creditBalance ?? 0 };
}

export interface GrantInput {
  userId: string;
  amount: number;
  type: 'PURCHASE' | 'ADMIN_GRANT' | 'WELCOME_GIFT';
  action: string;
  relatedOrderId?: string;
}

export async function grantCredits(
  db: CreditsTxClient,
  { userId, amount, type, action, relatedOrderId }: GrantInput,
): Promise<{ balance: number }> {
  const user = await db.user.update({
    where: { id: userId },
    data: { creditBalance: { increment: amount } },
    select: { creditBalance: true },
  });
  await db.creditTransaction.create({
    data: { userId, type, amount, action, relatedOrderId: relatedOrderId ?? null },
  });
  return { balance: user.creditBalance };
}
