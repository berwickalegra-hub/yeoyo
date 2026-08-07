import { prisma } from '@/lib/server/prisma';

// Blocking is symmetric in effect (neither side can message or discover the
// other) even though the underlying row is directional (blocker -> blocked).
export async function isBlockedEitherWay(userIdA: string, userIdB: string): Promise<boolean> {
  const row = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: userIdA, blockedId: userIdB },
        { blockerId: userIdB, blockedId: userIdA },
      ],
    },
    select: { id: true },
  });
  return !!row;
}

export async function blockedUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.blockedUser.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId));
}
