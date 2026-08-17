// Batched Premium-status lookup for lists of profile cards — same
// anti-N+1 shape as the `favorited`/`liked` Set lookups already used by
// /api/profiles/explorer. Recomputed on demand from `Subscription.status`
// rather than a denormalized flag, so nothing here can drift out of sync
// with webhook-driven subscription changes.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export async function getPremiumUserIds(
  prisma: PrismaClient,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const active = await prisma.subscription.findMany({
    where: { userId: { in: userIds }, status: 'ACTIVE' },
    select: { userId: true },
  });
  return new Set(active.map((s) => s.userId));
}
