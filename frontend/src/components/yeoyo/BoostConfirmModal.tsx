'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';

// Dedicated Boost confirmation dialog (2026-08-27, explicit user ask) —
// replaces the generic CreditConfirmModal for the Boost action so the user
// always sees WHAT a boost does and WHY it matters before spending. Opens
// for every user, including unlimited-access ones (who previously activated
// with no prompt at all). CreditConfirmModal stays as-is for the other paid
// actions (view favorited-by / visitors).
//
// Three states driven by `unlimited` and `balance` vs `cost`:
//   - unlimited: no cost line, "Activer le boost".
//   - enough balance: "Activer — N crédits".
//   - insufficient: swaps the CTA for "Acheter des crédits" → /app/credits.

const BENEFITS = [
  { icon: 'eye' as const, text: 'Beaucoup plus de vues sur ton profil' },
  { icon: 'inbox' as const, text: 'Plus de chances de recevoir des demandes de contact' },
  { icon: 'sparkles' as const, text: 'Parfait juste après avoir complété tes photos ou ta bio' },
];

export function BoostConfirmModal({
  open,
  onClose,
  cost,
  balance,
  unlimited,
  onConfirm,
  confirming,
}: {
  open: boolean;
  onClose: () => void;
  cost: number;
  balance: number;
  unlimited?: boolean;
  onConfirm: () => void;
  confirming?: boolean;
}) {
  const router = useRouter();
  const insufficient = !unlimited && balance < cost;

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#e6ac44] to-[#a9761d] text-gold-foreground shadow-md shadow-gold/30">
            <Icon name="zap" size={26} />
          </div>
          <div>
            <p className="font-headings text-lg font-bold text-foreground">Booster ton profil</p>
            <p className="mt-1.5 font-body text-sm text-muted-foreground">
              Pendant 24&nbsp;h, ton profil apparaît{' '}
              <strong className="text-foreground">en premier</strong> dans les résultats et affiche
              le badge{' '}
              <span className="inline-flex items-center gap-0.5 align-middle font-medium text-primary">
                <Icon name="zap" size={11} /> En avant
              </span>
              .
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3">
          {BENEFITS.map((b) => (
            <div key={b.text} className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
                <Icon name={b.icon} size={14} />
              </span>
              <span className="font-body text-xs text-foreground">{b.text}</span>
            </div>
          ))}
        </div>

        <p className="text-center font-body text-sm text-muted-foreground">
          {unlimited ? (
            <>Inclus dans ton accès illimité.</>
          ) : insufficient ? (
            <>
              Coût&nbsp;: {cost} crédit{cost > 1 ? 's' : ''} · Il te reste {balance} crédit
              {balance > 1 ? 's' : ''}.
            </>
          ) : (
            <>
              Coût&nbsp;: <strong className="text-foreground">{cost} crédits</strong> · Solde&nbsp;:{' '}
              {balance} crédit{balance > 1 ? 's' : ''}
            </>
          )}
        </p>

        <div className="flex flex-col gap-2">
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
              className="btn-premium flex h-12 items-center justify-center gap-2 rounded-full font-body text-sm font-bold transition-transform active:scale-95 disabled:opacity-50"
            >
              {confirming ? (
                <Icon name="refresh-cw" size={16} className="animate-spin" />
              ) : (
                <Icon name="zap" size={16} />
              )}
              {unlimited ? 'Activer le boost' : `Activer — ${cost} crédits`}
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
