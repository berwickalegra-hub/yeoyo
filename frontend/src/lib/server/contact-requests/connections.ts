import { prisma } from '@/lib/server/prisma';

// User IDs the given user already has an *active* contact-request tie with,
// in either direction — PENDING / VIEWED (a request is on the table) or
// ACCEPTED (they're matched). The discovery surfaces (Explorer deck,
// "Profil du jour", the home page's recommended strip) all exclude these:
// re-showing someone you've already asked, who has already asked you, or
// who you're already chatting with — with a fresh "Demander" button — reads
// as broken (2026-08-31, explicit user report: a matched pair kept seeing
// each other on Découvrir).
//
// CANCELLED / DECLINED requests are deliberately NOT excluded — a withdrawn
// or refused request shouldn't hide someone from discovery forever.
export async function activeContactRequestUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.contactRequest.findMany({
    where: {
      status: { in: ['PENDING', 'VIEWED', 'ACCEPTED'] },
      OR: [{ requesterId: userId }, { targetId: userId }],
    },
    select: { requesterId: true, targetId: true },
  });
  return rows.map((r) => (r.requesterId === userId ? r.targetId : r.requesterId));
}
