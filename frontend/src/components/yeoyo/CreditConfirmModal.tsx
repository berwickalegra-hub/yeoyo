'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';

// Shared credit-spend confirmation modal (2026-08-25, replaces
// PremiumGateModal.tsx) — shown before any paid action so the cost is
// never a surprise. Two modes driven by `balance` vs `cost`:
//   - enough balance: "Ça coûte N crédits — Confirmer / Annuler", calling
//     `onConfirm` (the caller does the actual spend + the gated action).
//   - insufficient balance: swaps the CTA for "Acheter des crédits",
//     navigating to the shop instead of a plain error (per product spec).
export function CreditConfirmModal({
  open,
  onClose,
  cost,
  balance,
  actionLabel,
  onConfirm,
  confirming,
}: {
  open: boolean;
  onClose: () => void;
  cost: number;
  balance: number;
  actionLabel: string;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  const router = useRouter();
  const insufficient = balance < cost;

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
          <Icon name="gem" size={26} className="text-primary" />
        </div>
        {insufficient ? (
          <div>
            <p className="font-headings text-lg font-bold text-foreground">
              Solde de crédits insuffisant
            </p>
            <p className="mt-1.5 font-body text-sm text-muted-foreground">
              {actionLabel} coûte {cost} crédit{cost > 1 ? 's' : ''}. Il te reste {balance} crédit
              {balance > 1 ? 's' : ''} — achète un pack pour continuer.
            </p>
          </div>
        ) : (
          <div>
            <p className="font-headings text-lg font-bold text-foreground">
              Confirmer l&rsquo;action
            </p>
            <p className="mt-1.5 font-body text-sm text-muted-foreground">
              {actionLabel} coûte {cost} crédit{cost > 1 ? 's' : ''}. Ton solde actuel : {balance}{' '}
              crédit{balance > 1 ? 's' : ''}.
            </p>
          </div>
        )}
        <div className="flex w-full flex-col gap-2">
          {insufficient ? (
            <button
              type="button"
              onClick={() => router.push('/app/credits')}
              className="btn-premium flex h-12 items-center justify-center gap-2 rounded-full font-body text-sm font-bold transition-transform active:scale-95"
            >
              <Icon name="gem" size={16} />
              Acheter des crédits
            </button>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirming}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-body text-sm font-bold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
            >
              {confirming ? (
                <Icon name="refresh-cw" size={16} className="animate-spin" />
              ) : (
                <Icon name="check" size={16} />
              )}
              Confirmer — {cost} crédit{cost > 1 ? 's' : ''}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="flex h-12 items-center justify-center rounded-full border border-border font-body text-sm font-medium text-muted-foreground transition-transform active:scale-95 disabled:opacity-50"
          >
            Annuler
          </button>
        </div>
      </div>
    </Modal>
  );
}
