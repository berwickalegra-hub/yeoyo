/**
 * Notification templates.
 *
 * Each project defines its own typed wrappers around `createNotification`.
 * The example below ships with the template — adapt it, replace it, or add
 * more (e.g. `firePaymentReceived`, `fireExportReady`). The pattern:
 *
 *   1. Build a `CreateNotificationInput` with a *deterministic* dedupeKey
 *      so the unique constraint enforces at-most-once delivery for that
 *      logical event (e.g. `payment-received:${orderId}` — never include
 *      a timestamp or random suffix).
 *   2. Pass the input + your PrismaClient to `createNotification`.
 *   3. Optionally enqueue an email via `EmailQueue.enqueue` — but ONLY
 *      after the notification row is created, so a duplicate event never
 *      sends a duplicate email.
 *
 * Keep these helpers free of side effects beyond the row insert; the
 * email enqueue belongs at the call site so each project can pick the
 * right channel (no email vs. transactional vs. marketing).
 */

import type { CreateNotificationInput } from './index';

export function welcomeNotification(userId: string, email: string): CreateNotificationInput {
  return {
    userId,
    type: 'WELCOME',
    title: 'Welcome!',
    body: `Glad to have you on board, ${email}.`,
    dedupeKey: `welcome:${userId}`,
  };
}

/**
 * Example: notification dispatched after a successful payment.
 * Called from the Bictorys webhook handler's `onPaid` post-commit hook.
 */
export function paymentReceived(
  userId: string,
  orderId: string,
  amount: number,
  currency: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'PAYMENT_RECEIVED',
    title: 'Payment received',
    body: `Order ${orderId} for ${amount} ${currency} confirmed.`,
    data: { orderId, amount, currency },
    dedupeKey: `payment-received:${orderId}`,
  };
}

/**
 * YeOyo — someone liked your profile, which auto-creates a PENDING contact
 * request (see POST /api/likes). dedupeKey is the ContactRequest's own id,
 * so re-liking (upsert no-op) doesn't re-notify.
 */
export function contactRequestReceived(
  userId: string,
  contactRequestId: string,
  fromName: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'CONTACT_REQUEST',
    title: 'Nouvelle demande de contact',
    body: `${fromName} souhaite entrer en contact avec toi.`,
    data: { contactRequestId },
    dedupeKey: `contact-request:${contactRequestId}`,
  };
}

/**
 * YeOyo — new message in a conversation. dedupeKey is the message's own id
 * (each Message row is exactly one logical event), not a timestamp.
 */
export function messageReceived(
  userId: string,
  conversationId: string,
  messageId: string,
  senderName: string,
  preview: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'MESSAGE_RECEIVED',
    title: `Nouveau message de ${senderName}`,
    body: preview.length > 140 ? `${preview.slice(0, 140)}…` : preview,
    data: { conversationId, messageId },
    dedupeKey: `message:${messageId}`,
  };
}
