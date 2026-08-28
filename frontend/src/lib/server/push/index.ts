import 'server-only';
import webpush from 'web-push';
import type { PrismaClient } from '@prisma/client';
import { createLogger } from '@/lib/server/logger';

const log = createLogger();

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export function isPushConfigured(): boolean {
  return (
    !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY && !!process.env.VAPID_SUBJECT
  );
}

let vapidReady = false;
let vapidBroken = false;
/**
 * `webpush.setVapidDetails()` validates its args and THROWS on a malformed
 * `VAPID_SUBJECT` (not mailto:/URL) or a key of the wrong byte length. This
 * runs on the `sendPushToUser` path, so it must never propagate — catch and
 * latch instead, disabling push for the process lifetime.
 */
function ensureVapid(): boolean {
  if (vapidReady) return true;
  if (vapidBroken) return false;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string,
    );
    vapidReady = true;
    return true;
  } catch (err) {
    log.warn('push: invalid VAPID_* configuration — web push disabled', { error: err });
    vapidBroken = true;
    return false;
  }
}

let warnedUnconfigured = false;

/**
 * Fire a Web Push to every browser `userId` has subscribed. Never throws —
 * callers use `void sendPushToUser(...)`. Subscriptions that the push
 * service reports as gone (404/410) are deleted.
 */
export async function sendPushToUser(
  prisma: PrismaClient,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!isPushConfigured()) {
    if (!warnedUnconfigured) {
      log.warn('push: VAPID_* not configured — web push is inert');
      warnedUnconfigured = true;
    }
    return;
  }

  let subs: { endpoint: string; p256dh: string; auth: string }[];
  try {
    subs = await prisma.pushSubscription.findMany({
      where: { userId },
      select: { endpoint: true, p256dh: true, auth: true },
    });
  } catch (err) {
    log.warn('push: failed to load subscriptions', { error: err, userId });
    return;
  }
  if (subs.length === 0) return;

  if (!ensureVapid()) return;
  const body = JSON.stringify(payload);

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription
            .delete({ where: { endpoint: s.endpoint } })
            .catch(() => undefined);
        } else {
          log.warn('push: send failed', { error: err, userId, statusCode });
        }
      }
    }),
  );
}
