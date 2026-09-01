'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useCredits } from '@/contexts/CreditsContext';
import { useToast } from '@/contexts/ToastContext';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SettingsSubHeader } from '@/components/yeoyo/SettingsSubHeader';
import { SettingsSection, SettingsRow } from '@/components/yeoyo/SettingsSection';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';

interface OrderRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

interface CreditTransactionRow {
  id: string;
  type: 'PURCHASE' | 'SPEND' | 'ADMIN_GRANT' | 'WELCOME_GIFT' | 'REFERRAL_CONVERSION';
  amount: number;
  action: string;
  createdAt: string;
}

interface ReferralInfo {
  affiliateCode: string;
  referralPoints: number;
  pointsPerCredit: number;
  referralUrl: string;
}

const ACTION_LABELS: Record<string, string> = {
  view_visitors: 'Voir qui a visité ton profil',
  view_favorited_by: "Voir qui t'a mis en favori",
  boost: 'Boost de visibilité (24h)',
  first_message: 'Premier message envoyé',
  admin_grant: 'Ajustement par YeOyo',
  welcome_gift: 'Cadeau de bienvenue',
  referral_points_conversion: 'Points de parrainage convertis',
};

function creditActionLabel(action: string): string {
  if (action.startsWith('credit_pack:')) {
    const packId = action.slice('credit_pack:'.length);
    return `Achat de pack — ${packId}`;
  }
  return ACTION_LABELS[action] ?? action;
}

export default function PaiementPage() {
  const user = useUser();
  const { balance, unlimited } = useCredits();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [creditTx, setCreditTx] = useState<CreditTransactionRow[]>([]);
  const [creditTxLoaded, setCreditTxLoaded] = useState(false);
  const [creditTxCursor, setCreditTxCursor] = useState<string | null>(null);
  const [creditTxLoadingMore, setCreditTxLoadingMore] = useState(false);
  const [referral, setReferral] = useState<ReferralInfo | null>(null);

  useEffect(() => {
    api<ReferralInfo>('/api/referral/me')
      .then(setReferral)
      .catch(() => undefined); // non-critical — section just stays hidden
  }, []);

  async function copyReferralLink() {
    if (!referral) return;
    try {
      await navigator.clipboard.writeText(referral.referralUrl);
      toast('Lien copié !', 'success');
    } catch {
      toast('Impossible de copier le lien', 'error');
    }
  }

  const loadCreditTx = useCallback(
    async (cursor?: string) => {
      setCreditTxLoadingMore(true);
      try {
        const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const res = await api<{ items: CreditTransactionRow[]; nextCursor: string | null }>(
          `/api/credits/transactions${params}`,
        );
        setCreditTx((prev) => (cursor ? [...prev, ...res.items] : res.items));
        setCreditTxCursor(res.nextCursor);
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
      } finally {
        setCreditTxLoadingMore(false);
      }
    },
    [toast],
  );

  async function onCreditHistoryToggle() {
    if (creditTxLoaded) return;
    setCreditTxLoaded(true);
    void loadCreditTx();
  }

  async function loadOrders() {
    if (ordersLoaded) return;
    setOrdersLoaded(true);
    // No dedicated "my orders" list route exists yet — the account export
    // endpoint already reads them for the data-export section on the
    // Confidentialité page, so this reuses it instead of adding a
    // near-duplicate route just for this history view.
    try {
      const data = await api<{ orders: OrderRow[] }>('/api/account/export');
      setOrders(data.orders);
    } catch {
      /* history is non-critical */
    }
  }

  if (!user) return null;

  return (
    <AppShell
      active="parametres"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <SettingsSubHeader title="Paiement" subtitle="Tes crédits et ton historique" />
      <div className="flex flex-col gap-4 px-5 py-6 lg:mx-auto lg:max-w-3xl lg:px-8">
        <SettingsSection title="Paiement">
          <SettingsRow
            label="Solde de crédits"
            helper={
              unlimited ? 'Illimité (compte staff)' : `${balance} crédit${balance > 1 ? 's' : ''}`
            }
          >
            <Link
              href="/app/credits"
              className="btn-premium rounded-lg px-4 py-2 font-body text-sm font-semibold"
            >
              Acheter des crédits
            </Link>
          </SettingsRow>
          <details onToggle={() => void loadOrders()}>
            <summary className="cursor-pointer font-body text-sm font-medium text-foreground">
              Historique des paiements
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              {orders.length === 0 && (
                <p className="font-body text-xs text-muted-foreground">
                  Aucun paiement pour l’instant.
                </p>
              )}
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between font-body text-xs text-muted-foreground"
                >
                  <span>{new Date(o.createdAt).toLocaleDateString('fr-FR')}</span>
                  <span>
                    {(o.amount / 100).toFixed(2)} {o.currency}
                  </span>
                  <span>{o.status}</span>
                </div>
              ))}
            </div>
          </details>
          <details onToggle={() => void onCreditHistoryToggle()}>
            <summary className="cursor-pointer font-body text-sm font-medium text-foreground">
              Historique des crédits
            </summary>
            <div className="mt-3 flex flex-col gap-2">
              {creditTxLoaded && creditTx.length === 0 && !creditTxLoadingMore && (
                <p className="font-body text-xs text-muted-foreground">
                  Aucune transaction de crédits pour l’instant.
                </p>
              )}
              {creditTx.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between font-body text-xs text-muted-foreground"
                >
                  <span>{new Date(t.createdAt).toLocaleDateString('fr-FR')}</span>
                  <span className="flex-1 truncate px-2 text-foreground">
                    {creditActionLabel(t.action)}
                  </span>
                  <span className={t.amount >= 0 ? 'text-verified' : 'text-foreground'}>
                    {t.amount >= 0 ? '+' : ''}
                    {t.amount}
                  </span>
                </div>
              ))}
              {creditTxCursor && (
                <button
                  type="button"
                  onClick={() => void loadCreditTx(creditTxCursor)}
                  disabled={creditTxLoadingMore}
                  className="mt-1 self-start font-body text-xs font-medium text-primary disabled:opacity-50"
                >
                  {creditTxLoadingMore ? 'Chargement…' : 'Charger plus'}
                </button>
              )}
            </div>
          </details>
        </SettingsSection>

        {referral && (
          <SettingsSection
            title="Parrainage"
            description="Invite tes proches — chaque compte vérifié te rapporte des points, convertis automatiquement en crédits."
          >
            <SettingsRow label="Ton code" helper={referral.affiliateCode}>
              <button
                type="button"
                onClick={() => void copyReferralLink()}
                className="btn-premium rounded-lg px-4 py-2 font-body text-sm font-semibold"
              >
                Copier le lien
              </button>
            </SettingsRow>
            <div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/30">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, (referral.referralPoints / referral.pointsPerCredit) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-2 font-body text-xs text-muted-foreground">
                {referral.referralPoints}/{referral.pointsPerCredit} points — encore{' '}
                {referral.pointsPerCredit - referral.referralPoints} points pour ton prochain
                crédit.
              </p>
            </div>
          </SettingsSection>
        )}
      </div>
    </AppShell>
  );
}
