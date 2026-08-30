// Free-tier daily contact-request cap (2026-08-30, explicit user ask: was
// monthly until now — the landing page's own comparison table used to
// advertise "5 / mois" free vs "Illimitées" Premium, pure marketing copy
// with no server-side enforcement until 2026-08-17; now a 10/day cap that
// resets every night instead of once a month).
// ADMIN/SUPERADMIN are unlimited (2026-08-25: this used to bypass for ACTIVE
// Premium subscribers — the Subscription model is gone in favor of the
// credit system per the new product spec, which never mentioned this quota,
// so the bypass now follows the same staff-only pattern as
// lib/server/credits/ledger.ts instead of reintroducing a paid tier here).
// Counting via a createdAt range query (not a separate counter row that
// could drift out of sync) mirrors the app's other daily caps — see
// lib/server/daily-quota.ts, shared with Coach's message limit and the
// profile stats-today route.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { startOfUtcDay, nextUtcMidnight } from '@/lib/server/daily-quota';

export const FREE_DAILY_CONTACT_REQUEST_LIMIT = 10;

export async function contactRequestQuotaStatus(
  userId: string,
): Promise<{ remaining: number | null; limit: number | null; resetAt: string | null }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  const isStaff = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
  if (isStaff) return { remaining: null, limit: null, resetAt: null };

  const sentToday = await prisma.contactRequest.count({
    where: { requesterId: userId, createdAt: { gte: startOfUtcDay() } },
  });
  return {
    remaining: Math.max(0, FREE_DAILY_CONTACT_REQUEST_LIMIT - sentToday),
    limit: FREE_DAILY_CONTACT_REQUEST_LIMIT,
    resetAt: nextUtcMidnight().toISOString(),
  };
}
