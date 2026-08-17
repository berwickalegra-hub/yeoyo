// Free-tier daily sent-message cap (Banani's "Mes stats du jour" panel).
// ACTIVE Premium subscribers are unlimited. Shared by POST
// /api/conversations/[id]/messages (enforcement) and GET
// /api/profiles/explorer (Découvrir stats panel display) — see
// IMPLEMENTATION-PLAN-v2.md for the numbers.
import 'server-only';
import { prisma } from '@/lib/server/prisma';
import { startOfUtcDay, nextUtcMidnight } from '@/lib/server/daily-quota';

export const FREE_DAILY_MESSAGE_LIMIT = 3;

export async function messageQuotaStatus(
  userId: string,
): Promise<{ remaining: number | null; limit: number | null; resetAt: string | null }> {
  const activeSub = await prisma.subscription.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (activeSub) return { remaining: null, limit: null, resetAt: null };

  const sentToday = await prisma.message.count({
    where: { senderId: userId, createdAt: { gte: startOfUtcDay() } },
  });
  return {
    remaining: Math.max(0, FREE_DAILY_MESSAGE_LIMIT - sentToday),
    limit: FREE_DAILY_MESSAGE_LIMIT,
    resetAt: nextUtcMidnight().toISOString(),
  };
}
