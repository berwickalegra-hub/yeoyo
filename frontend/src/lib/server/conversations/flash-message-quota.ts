// Lifetime free quota for the "Message" shortcut on Découvrir's swipe card
// (POST /api/likes + jump straight into the conversation, before the
// request is formally accepted) — distinct from message-quota.ts's daily
// sent-message cap, which limits messages sent *inside* an already-open
// conversation. ACTIVE Premium subscribers are always allowed and never
// consume the counter.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export const FREE_FLASH_MESSAGE_LIMIT = 3;

export interface FlashMessageQuotaResult {
  allowed: boolean;
  remaining: number | null;
}

// Atomic check-and-consume: Premium subscribers always pass without
// touching the counter; free users pass (and increment) only while
// `flashMessagesUsed < FREE_FLASH_MESSAGE_LIMIT`. Single UPDATE with a
// WHERE-bound guard, not a separate read-then-write, so two concurrent
// taps can't both slip through on the last free use.
export async function consumeFlashMessageQuota(
  prisma: PrismaClient,
  userId: string,
): Promise<FlashMessageQuotaResult> {
  const activeSub = await prisma.subscription.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (activeSub) return { allowed: true, remaining: null };

  const updated = await prisma.profile.updateMany({
    where: { userId, flashMessagesUsed: { lt: FREE_FLASH_MESSAGE_LIMIT } },
    data: { flashMessagesUsed: { increment: 1 } },
  });

  if (updated.count === 0) {
    return { allowed: false, remaining: 0 };
  }

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { flashMessagesUsed: true },
  });
  const used = profile?.flashMessagesUsed ?? FREE_FLASH_MESSAGE_LIMIT;
  return { allowed: true, remaining: Math.max(0, FREE_FLASH_MESSAGE_LIMIT - used) };
}
