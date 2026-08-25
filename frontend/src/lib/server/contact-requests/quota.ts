// Free-tier monthly contact-request cap (the landing page's own comparison
// table used to advertise "5 / mois" free vs "Illimitées" Premium — this was
// pure marketing copy with no server-side enforcement until 2026-08-17).
// ADMIN/SUPERADMIN are unlimited (2026-08-25: this used to bypass for ACTIVE
// Premium subscribers — the Subscription model is gone in favor of the
// credit system per the new product spec, which never mentioned this quota,
// so the bypass now follows the same staff-only pattern as
// lib/server/credits/ledger.ts instead of reintroducing a paid tier here).
// Counting via a createdAt range query mirrors message-quota.ts's daily cap
// rather than a separate counter row that could drift out of sync.
import 'server-only';
import { prisma } from '@/lib/server/prisma';

export const FREE_MONTHLY_CONTACT_REQUEST_LIMIT = 5;

function startOfUtcMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function nextUtcMonth(): Date {
  const start = startOfUtcMonth();
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

export async function contactRequestQuotaStatus(
  userId: string,
): Promise<{ remaining: number | null; limit: number | null; resetAt: string | null }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const isStaff = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
  if (isStaff) return { remaining: null, limit: null, resetAt: null };

  const sentThisMonth = await prisma.contactRequest.count({
    where: { requesterId: userId, createdAt: { gte: startOfUtcMonth() } },
  });
  return {
    remaining: Math.max(0, FREE_MONTHLY_CONTACT_REQUEST_LIMIT - sentThisMonth),
    limit: FREE_MONTHLY_CONTACT_REQUEST_LIMIT,
    resetAt: nextUtcMonth().toISOString(),
  };
}
