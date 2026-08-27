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
/**
 * YeOyo — a credit-pack purchase settled (see
 * lib/server/credits/reconcile.ts). Kept as `paymentReceived` with its
 * original (userId, orderId, amount, currency) signature deliberately —
 * outbox/dispatcher.ts (PROTECTED) calls this by name with those exact
 * args, so the copy is updated in place rather than adding a new template
 * that would require editing the protected dispatcher. dedupeKey is the
 * Order's own id, so a late duplicate reconcile (webhook + cron both
 * catching the same settlement) can't double-notify.
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
    title: 'Paiement confirmé',
    body: `Ton paiement de ${amount} ${currency} est confirmé — tes crédits ont été ajoutés à ton solde.`,
    data: { orderId, amount, currency },
    dedupeKey: `payment-received:${orderId}`,
  };
}

/**
 * YeOyo — someone liked your profile, which auto-creates a PENDING contact
 * request (see POST /api/likes). dedupeKey is the ContactRequest's own id,
 * so re-liking (upsert no-op) doesn't re-notify. Copy deliberately spells
 * out "s'intéresse à toi" + "attend ta réponse" (2026-08-21, explicit user
 * ask) so the recipient reads this as a real, waiting person — not a
 * generic system event.
 */
export function contactRequestReceived(
  userId: string,
  contactRequestId: string,
  fromName: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'CONTACT_REQUEST',
    title: `${fromName} s'intéresse à toi`,
    body: `${fromName} attend ta réponse pour faire connaissance.`,
    data: { contactRequestId },
    dedupeKey: `contact-request:${contactRequestId}`,
  };
}

/**
 * YeOyo — the target accepted a pending contact request (see POST
 * /api/contact-requests/[id]/respond, action=ACCEPT), sent to the original
 * requester so they find out even if they're not staring at the Demandes
 * tab (the accepter already knows — they're the one who just tapped
 * Accepter). dedupeKey is the ContactRequest's own id, matching
 * contactRequestDeclined's pattern. 2026-08-21, explicit user ask: a match
 * must read as "something new starting", not a silent status flip.
 */
export function contactRequestAccepted(
  userId: string,
  contactRequestId: string,
  conversationId: string,
  fromName: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'CONTACT_REQUEST_ACCEPTED',
    title: `C'est un match avec ${fromName} !`,
    body: `${fromName} a accepté ta demande — une nouvelle conversation commence.`,
    data: { contactRequestId, conversationId },
    dedupeKey: `contact-request-accepted:${contactRequestId}`,
  };
}

/**
 * YeOyo — the target declined a pending contact request (see POST
 * /api/contact-requests/[id]/respond, action=DECLINE). dedupeKey is the
 * ContactRequest's own id, matching contactRequestReceived's pattern.
 */
export function contactRequestDeclined(
  userId: string,
  contactRequestId: string,
  fromName: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'CONTACT_REQUEST_DECLINED',
    title: 'Demande déclinée',
    body: `${fromName} n’a pas donné suite à ta demande de contact.`,
    data: { contactRequestId },
    dedupeKey: `contact-request-declined:${contactRequestId}`,
  };
}

/**
 * YeOyo — a profile crossed the auto-suspend report threshold (see
 * lib/server/reports/auto-suspend.ts). dedupeKey includes reportCount, not
 * just userId, so a future re-suspension (after an admin restores the
 * account and it accumulates fresh reports past the threshold again) still
 * notifies instead of being silently deduped against the first event.
 */
export function accountAutoSuspended(userId: string, reportCount: number): CreateNotificationInput {
  return {
    userId,
    type: 'ACCOUNT_AUTO_SUSPENDED',
    title: 'Ton compte est suspendu',
    body: 'Ton profil a reçu plusieurs signalements et est suspendu le temps que notre équipe l’examine.',
    data: { reportCount },
    dedupeKey: `account-auto-suspended:${userId}:${reportCount}`,
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

/**
 * YeOyo — an admin approved a pending profile (POST
 * /api/admin/verification-queue/[id]/process, action=APPROVE). dedupeKey is
 * the Profile's own id, matching this route's other admin-facing pattern —
 * a profile has exactly one first-verification event per id in practice.
 */
export function profileVerified(userId: string, profileId: string): CreateNotificationInput {
  return {
    userId,
    type: 'PROFILE_VERIFIED',
    title: 'Ton profil est vérifié !',
    body: 'Notre équipe a vérifié ton profil — le badge Vérifié est maintenant visible sur tes photos.',
    dedupeKey: `profile-verified:${profileId}`,
  };
}

/**
 * YeOyo — an admin rejected a pending profile (same route, action=REJECT).
 * `reason` is the admin's optional free-text note from the verification
 * fiche — included in the body when given so the user knows what to fix.
 */
export function profileRejected(
  userId: string,
  profileId: string,
  reason?: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'PROFILE_REJECTED',
    title: 'Ta vérification de profil a été refusée',
    body: reason
      ? `Ton profil n'a pas pu être vérifié : ${reason}`
      : "Ton profil n'a pas pu être vérifié. Vérifie que tes photos sont claires, récentes et te montrent bien, puis réessaie.",
    dedupeKey: `profile-rejected:${profileId}`,
  };
}
