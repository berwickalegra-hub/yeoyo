// Free quota for the "Message" shortcut on Découvrir's swipe card (POST
// /api/likes + jump straight into the conversation, before the request is
// formally accepted) — distinct from message-quota.ts's daily sent-message
// cap, which limits messages sent *inside* an already-open conversation.
// ACTIVE Premium subscribers are always allowed and never consume the
// counter.
//
// FREE_FLASH_MESSAGE_LIMIT resets every rolling 24h (2026-08-21, explicit
// user ask: "5/j soit l'homme s'abonne pour utiliser en illimité ou
// attendre demain") — not a lifetime cap. flashMessagesResetAt marks the
// end of the current window; once now() passes it, the next attempt opens
// a fresh window and resets the counter.
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export const FREE_FLASH_MESSAGE_LIMIT = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface FlashMessageQuotaResult {
  allowed: boolean;
  remaining: number | null;
  resetAt: string | null;
}

// Two atomically-guarded updateMany calls instead of one, so the whole
// thing stays expressible in Prisma's query builder (no raw SQL): the two
// WHERE clauses are mutually exclusive (window stale vs. window active),
// so for any given request exactly one of them can ever match, and each
// individually still blocks a concurrent over-consumption past the limit.
export async function consumeFlashMessageQuota(
  prisma: PrismaClient,
  userId: string,
): Promise<FlashMessageQuotaResult> {
  const activeSub = await prisma.subscription.findFirst({
    where: { userId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (activeSub) return { allowed: true, remaining: null, resetAt: null };

  const now = new Date();
  const nextResetAt = new Date(now.getTime() + WINDOW_MS);

  // Window expired (or never started) — atomically open a fresh one and
  // consume the first use in the same UPDATE.
  const resetAttempt = await prisma.profile.updateMany({
    where: {
      userId,
      OR: [{ flashMessagesResetAt: null }, { flashMessagesResetAt: { lte: now } }],
    },
    data: { flashMessagesUsed: 1, flashMessagesResetAt: nextResetAt },
  });
  if (resetAttempt.count > 0) {
    return {
      allowed: true,
      remaining: FREE_FLASH_MESSAGE_LIMIT - 1,
      resetAt: nextResetAt.toISOString(),
    };
  }

  // Window still active — consume one use only while under the limit.
  const incrementAttempt = await prisma.profile.updateMany({
    where: {
      userId,
      flashMessagesResetAt: { gt: now },
      flashMessagesUsed: { lt: FREE_FLASH_MESSAGE_LIMIT },
    },
    data: { flashMessagesUsed: { increment: 1 } },
  });

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { flashMessagesUsed: true, flashMessagesResetAt: true },
  });
  const resetAt = profile?.flashMessagesResetAt?.toISOString() ?? null;

  if (incrementAttempt.count === 0) {
    return { allowed: false, remaining: 0, resetAt };
  }

  const used = profile?.flashMessagesUsed ?? FREE_FLASH_MESSAGE_LIMIT;
  return { allowed: true, remaining: Math.max(0, FREE_FLASH_MESSAGE_LIMIT - used), resetAt };
}
