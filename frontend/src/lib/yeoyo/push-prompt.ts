'use client';

// Client-only coordination for the <NotificationPrompt> bottom-sheet — the
// gentle "activer les notifications" nudge shown at high-intent moments
// (right after a first contact request, first time opening Messages). The
// prompt itself is mounted once in AppShell and listens for the window
// event dispatched here, so call sites stay a one-liner and don't each
// re-implement the "already granted? snoozed? already shown?" checks.

export type PushPromptReason = 'contact-request' | 'messages-open';

export const PUSH_PROMPT_EVENT = 'yeoyo:push-prompt';

const SNOOZE_KEY = 'yeoyo.push.snoozeUntil';
const SEEN_KEY_PREFIX = 'yeoyo.push.seen:';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // "Plus tard" → hidden for a week

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / storage disabled — the prompt just won't remember */
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Ask the mounted prompt to consider showing itself. No-op on the server. */
export function triggerPushPrompt(reason: PushPromptReason): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PUSH_PROMPT_EVENT, { detail: { reason } }));
}

/** True while the user's last "Plus tard" is still within the snooze window. */
export function isPushPromptSnoozed(): boolean {
  const raw = safeGet(SNOOZE_KEY);
  if (!raw) return false;
  const until = Number(raw);
  return Number.isFinite(until) && Date.now() < until;
}

export function snoozePushPrompt(): void {
  safeSet(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
}

/** Cleared once notifications are actually enabled — nothing left to nudge. */
export function clearPushPromptSnooze(): void {
  safeRemove(SNOOZE_KEY);
}

export function hasPromptReasonBeenSeen(reason: PushPromptReason): boolean {
  return safeGet(SEEN_KEY_PREFIX + reason) === '1';
}

export function markPromptReasonSeen(reason: PushPromptReason): void {
  safeSet(SEEN_KEY_PREFIX + reason, '1');
}
