'use client';

// Gentle "activer les notifications" bottom-sheet. Mounted once in AppShell;
// it does nothing until a high-intent moment dispatches PUSH_PROMPT_EVENT
// (see lib/yeoyo/push-prompt.ts) — right after a first contact request, or
// the first time Messages is opened. Shows at most once per reason, and
// "Plus tard" hides it everywhere for a week.
//
// It only ever appears when push is genuinely actionable (state === 'default'
// — supported, configured, permission not yet asked). Already-granted,
// blocked, unsupported and iOS-needs-install are handled by the inline
// banner on Accueil, not here. A trigger that arrives before usePushNotifications
// has resolved its state is held as `pendingReason` and re-evaluated once it does.

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/contexts/ToastContext';
import { usePushNotifications } from '@/lib/yeoyo/usePushNotifications';
import {
  PUSH_PROMPT_EVENT,
  clearPushPromptSnooze,
  hasPromptReasonBeenSeen,
  isPushPromptSnoozed,
  markPromptReasonSeen,
  snoozePushPrompt,
  type PushPromptReason,
} from '@/lib/yeoyo/push-prompt';

export function NotificationPrompt() {
  const { state, enable } = usePushNotifications();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingReason, setPendingReason] = useState<PushPromptReason | null>(null);

  useEffect(() => {
    function onTrigger(e: Event) {
      const reason = (e as CustomEvent<{ reason?: PushPromptReason }>).detail?.reason;
      if (!reason) return;
      if (hasPromptReasonBeenSeen(reason) || isPushPromptSnoozed()) return;
      setPendingReason(reason);
    }
    window.addEventListener(PUSH_PROMPT_EVENT, onTrigger);
    return () => window.removeEventListener(PUSH_PROMPT_EVENT, onTrigger);
  }, []);

  // Act on a queued trigger once push state is known to be actionable.
  useEffect(() => {
    if (!pendingReason || state !== 'default') return;
    if (!hasPromptReasonBeenSeen(pendingReason) && !isPushPromptSnoozed()) {
      markPromptReasonSeen(pendingReason);
      setOpen(true);
    }
    setPendingReason(null);
  }, [pendingReason, state]);

  // Notifications enabled (or blocked) elsewhere while we're open → close.
  useEffect(() => {
    if (open && state !== 'default') setOpen(false);
  }, [open, state]);

  const activate = useCallback(async () => {
    setBusy(true);
    try {
      await enable();
      clearPushPromptSnooze();
      toast('Notifications activées', 'success');
      setOpen(false);
    } catch {
      toast("Impossible d'activer les notifications. Réessaie.", 'error');
    } finally {
      setBusy(false);
    }
  }, [enable, toast]);

  const later = useCallback(() => {
    snoozePushPrompt();
    setOpen(false);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 md:pb-5">
      <div className="animate-fade-in-up w-full max-w-md rounded-2xl border border-border bg-surface p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Icon name="bell" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-headings text-sm font-bold text-foreground">Reste au courant</p>
            <p className="mt-0.5 font-body text-xs text-muted-foreground">
              Sois prévenu·e dès qu&rsquo;on accepte ta demande ou qu&rsquo;on t&rsquo;écrit.
            </p>
          </div>
          <button
            type="button"
            onClick={later}
            aria-label="Plus tard"
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void activate()}
            disabled={busy}
            className="btn-press flex-1 rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? 'Activation…' : 'Activer'}
          </button>
          <button
            type="button"
            onClick={later}
            className="btn-press rounded-lg border border-border px-4 py-2 font-body text-sm font-medium text-muted-foreground"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}
