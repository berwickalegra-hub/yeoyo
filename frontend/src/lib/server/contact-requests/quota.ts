// Free-tier monthly contact-request cap (the landing page's own comparison
// table advertises "5 / mois" free vs "Illimitées" Premium — this was pure
// marketing copy with no server-side enforcement until now, 2026-08-17).
// ACTIVE Premium subscribers (including the admin-always-Premium self-heal
// in /api/subscriptions/me) are unlimited. Counting via a createdAt range
// query mirrors message-quota.ts's daily cap rather than a separate counter
// row that could drift out of sync.
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
  const activeSub = await prisma.subscription.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (activeSub) return { remaining: null, limit: null, resetAt: null };

  const sentThisMonth = await prisma.contactRequest.count({
    where: { requesterId: userId, createdAt: { gte: startOfUtcMonth() } },
  });
  return {
    remaining: Math.max(0, FREE_MONTHLY_CONTACT_REQUEST_LIMIT - sentThisMonth),
    limit: FREE_MONTHLY_CONTACT_REQUEST_LIMIT,
    resetAt: nextUtcMonth().toISOString(),
  };
}
