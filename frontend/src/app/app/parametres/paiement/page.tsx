'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { usePremium } from '@/contexts/PremiumContext';
import { useToast } from '@/contexts/ToastContext';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SettingsSubHeader } from '@/components/yeoyo/SettingsSubHeader';
import { SettingsSection, SettingsRow } from '@/components/yeoyo/SettingsSection';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';

interface SubscriptionInfo {
  planName: string;
  status: string;
  currentPeriodEnd: string | null;
}

interface OrderRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export default function PaiementPage() {
  const user = useUser();
  const { isPremium } = usePremium();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ subscription: SubscriptionInfo | null }>('/api/subscriptions/me');
      setSubscription(res.subscription);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }, [toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

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
      <SettingsSubHeader
        title="Paiement"
        subtitle="Ton abonnement et ton historique"
        premium={isPremium}
      />
      <div className="flex flex-col gap-4 px-5 py-6 lg:mx-auto lg:max-w-3xl lg:px-8">
        <SettingsSection title="Paiement">
          <SettingsRow
            label="Plan actuel"
            helper={
              subscription
                ? `${subscription.planName} — ${subscription.status === 'ACTIVE' ? 'Actif' : 'En attente'}`
                : 'Plan Gratuit'
            }
          >
            <Link
              href="/app/premium"
              className={`rounded-lg px-4 py-2 font-body text-sm font-semibold ${
                subscription?.status === 'ACTIVE'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-gold text-gold-foreground'
              }`}
            >
              {subscription?.status === 'ACTIVE' ? 'Voir' : 'Passer Premium'}
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
        </SettingsSection>
      </div>
    </AppShell>
  );
}
