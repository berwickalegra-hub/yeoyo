'use client';

import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Icon, type IconName } from '@/components/ui/Icon';

// The other half of the 2026-08-29 notification-consistency pass — brief
// "it worked" confirmations use RequestSentOverlay (auto-dismisses, no
// action needed); a hard stop the user must actually read and act on
// (monthly contact-request quota reached, insufficient credits for a paid
// action) uses this instead. Explicit user report: the old behavior was a
// toast that faded after 3s while the swipe card had already been left in
// an ambiguous state, reading as a bug ("l'écran reste tout blanc"). This
// modal never auto-dismisses — it stays until the user picks an action.
export interface LimitReachedInfo {
  icon: IconName;
  title: string;
  message: string;
  /** The way forward that actually resolves the block — omit if there isn't one. */
  primaryAction?: { label: string; href: string } | { label: string; onClick: () => void };
  /** Dismiss button label — defaults to "Fermer". */
  dismissLabel?: string;
}

export function LimitReachedModal({
  info,
  onClose,
}: {
  info: LimitReachedInfo | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!info} onClose={onClose}>
      {info && (
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary/10 text-secondary">
            <Icon name={info.icon} size={26} />
          </span>
          <p className="font-headings text-lg font-bold text-foreground">{info.title}</p>
          <p className="font-body text-sm text-muted-foreground">{info.message}</p>
          <div className="mt-2 flex w-full flex-col gap-2">
            {info.primaryAction &&
              ('href' in info.primaryAction ? (
                <Link
                  href={info.primaryAction.href}
                  className="w-full rounded-xl bg-primary py-3 text-center font-body text-sm font-semibold text-primary-foreground"
                >
                  {info.primaryAction.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={info.primaryAction.onClick}
                  className="w-full rounded-xl bg-primary py-3 font-body text-sm font-semibold text-primary-foreground"
                >
                  {info.primaryAction.label}
                </button>
              ))}
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-border py-3 font-body text-sm font-medium text-foreground"
            >
              {info.dismissLabel ?? 'Fermer'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
