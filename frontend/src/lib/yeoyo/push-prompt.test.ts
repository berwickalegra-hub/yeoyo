import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearPushPromptSnooze,
  hasPromptReasonBeenSeen,
  isPushPromptSnoozed,
  markPromptReasonSeen,
  snoozePushPrompt,
} from './push-prompt';

// Minimal localStorage stand-in (the test env is `node`, no `window`).
function installStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('push-prompt snooze', () => {
  beforeEach(() => {
    installStorage();
  });

  it('is not snoozed by default', () => {
    expect(isPushPromptSnoozed()).toBe(false);
  });

  it('snoozes for a week, then expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T00:00:00Z'));
    snoozePushPrompt();
    expect(isPushPromptSnoozed()).toBe(true);

    vi.setSystemTime(new Date('2026-09-10T00:00:00Z')); // +6 days
    expect(isPushPromptSnoozed()).toBe(true);

    vi.setSystemTime(new Date('2026-09-12T00:00:00Z')); // +8 days
    expect(isPushPromptSnoozed()).toBe(false);
  });

  it('clearPushPromptSnooze removes an active snooze', () => {
    snoozePushPrompt();
    clearPushPromptSnooze();
    expect(isPushPromptSnoozed()).toBe(false);
  });

  it('treats a storage failure as "not snoozed" (fail open — still promptable)', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
      },
    });
    expect(isPushPromptSnoozed()).toBe(false);
  });
});

describe('push-prompt per-reason seen flag', () => {
  beforeEach(() => {
    installStorage();
  });

  it('tracks each reason independently', () => {
    expect(hasPromptReasonBeenSeen('contact-request')).toBe(false);
    markPromptReasonSeen('contact-request');
    expect(hasPromptReasonBeenSeen('contact-request')).toBe(true);
    expect(hasPromptReasonBeenSeen('messages-open')).toBe(false);
  });
});
