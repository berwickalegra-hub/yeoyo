// Premium Checkout — built from the Banani "Premium Checkout (Desktop)"
// screen. Checkout is wired to a STUB payment provider on purpose (user
// decision: build this UI in parallel, wire a real Stripe/Moneroo charge
// later) — "Passer au paiement" creates an Order+Subscription server-side
// and routes to /app/premium/pending, which is where a real redirect would
// eventually land too.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';

interface Plan {
  id: 'monthly' | 'semiannual' | 'annual';
  name: string;
  priceCentsTotal: number;
  priceCentsPerMonth: number;
  billingMonths: number;
  badge?: string;
  features: string[];
  priceCdfDisplayTotal: number;
  priceCdfDisplayPerMonth: number;
}

interface SubscriptionInfo {
  planName: string;
  status: string;
}

const PAYMENT_METHODS = [
  { value: 'M_PESA', label: 'M-Pesa' },
  { value: 'AIRTEL_MONEY', label: 'Airtel Money' },
  { value: 'ORANGE_MONEY', label: 'Orange Money' },
] as const;

const COMPARISON_ROWS: { feature: string; free: string | boolean; premium: string | boolean }[] = [
  { feature: 'Demandes de contact', free: '5 / mois', premium: 'Illimitées' },
  { feature: 'Voir les likes reçus', free: false, premium: true },
  { feature: 'Filtres avancés', free: false, premium: true },
  { feature: 'Chat illimité', free: false, premium: true },
  { feature: 'Profils vérifiés', free: true, premium: true },
  { feature: 'Pas de publicités', free: false, premium: true },
  { feature: 'Badge Premium', free: false, premium: true },
  { feature: 'Support prioritaire', free: false, premium: true },
];

export default function PremiumPage() {
  const user = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const badgeCounts = useNavCounts();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<Plan['id']>('semiannual');
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]['value']>('M_PESA');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, subRes] = await Promise.all([
        api<{ plans: Plan[] }>('/api/subscriptions/plans'),
        api<{ subscription: SubscriptionInfo | null }>('/api/subscriptions/me'),
      ]);
      setPlans(plansRes.plans);
      setSubscription(subRes.subscription);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function checkout() {
    setSubmitting(true);
    try {
      const res = await api<{ orderId: string }>('/api/subscriptions/checkout', {
        method: 'POST',
        body: { planId: selectedPlanId, paymentMethod },
      });
      router.push(`/app/premium/pending?orderId=${res.orderId}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const monthlyPlan = plans.find((p) => p.id === 'monthly');
  const discountPercent =
    selectedPlan && monthlyPlan && selectedPlan.id !== 'monthly'
      ? Math.round((1 - selectedPlan.priceCentsPerMonth / monthlyPlan.priceCentsPerMonth) * 100)
      : 0;

  return (
    <AppShell active="parametres" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <div className="px-5 py-6 lg:px-8">
        <div className="mb-6">
          <h1 className="font-headings text-2xl font-bold text-foreground">Passer Premium</h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            Débloquez toutes les fonctionnalités avec un paiement sécurisé via Mobile Money.
          </p>
        </div>

        {loading && <p className="font-body text-sm text-muted-foreground">Chargement…</p>}

        {!loading && subscription?.status === 'ACTIVE' && (
          <div className="max-w-lg rounded-xl border border-verified bg-surface p-6 text-center">
            <p className="font-headings text-lg font-bold text-foreground">
              Tu es déjà Premium ({subscription.planName})
            </p>
            <Link
              href="/app/parametres"
              className="mt-4 inline-block text-sm text-primary underline"
            >
              Retour aux paramètres
            </Link>
          </div>
        )}

        {!loading && subscription?.status !== 'ACTIVE' && (
          <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
            <div>
              <h2 className="mb-3 font-headings text-lg font-bold text-foreground">
                Choisissez votre plan
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`flex flex-col rounded-xl border p-4 text-left ${
                      selectedPlanId === plan.id
                        ? 'border-primary bg-secondary'
                        : 'border-border bg-surface'
                    }`}
                  >
                    {plan.badge && (
                      <span className="mb-2 self-start rounded-full bg-primary px-2.5 py-0.5 font-body text-xs font-semibold text-primary-foreground">
                        {plan.badge}
                      </span>
                    )}
                    <span className="font-headings text-sm font-bold text-foreground">
                      {plan.name}
                    </span>
                    <span className="mt-1 font-headings text-xl font-bold text-primary">
                      ${(plan.priceCentsPerMonth / 100).toFixed(2)}
                      <span className="font-body text-xs font-normal text-muted-foreground">
                        /mois
                      </span>
                    </span>
                    <span className="font-body text-xs text-muted-foreground">
                      ≈ {plan.priceCdfDisplayPerMonth.toLocaleString('fr-FR')} FC/mois
                    </span>
                    <ul className="mt-3 flex flex-col gap-1.5">
                      {plan.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-1.5 font-body text-xs text-muted-foreground"
                        >
                          <Icon
                            name="check"
                            size={12}
                            className="mt-0.5 flex-shrink-0 text-primary"
                          />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>

              <h3 className="mb-3 mt-8 font-headings text-base font-bold text-foreground">
                Comparez les plans
              </h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left font-body text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Fonctionnalité</th>
                      <th className="px-3 py-2 font-medium">Gratuit</th>
                      <th className="px-3 py-2 font-medium">Premium</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON_ROWS.map((row) => (
                      <tr key={row.feature} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-foreground">{row.feature}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {typeof row.free === 'boolean' ? (row.free ? '✓' : '—') : row.free}
                        </td>
                        <td className="px-3 py-2 text-primary">
                          {typeof row.premium === 'boolean'
                            ? row.premium
                              ? '✓'
                              : '—'
                            : row.premium}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="h-fit rounded-xl border border-border bg-surface p-5">
              <h2 className="font-headings text-base font-bold text-foreground">
                Résumé de commande
              </h2>
              {selectedPlan && (
                <>
                  <p className="mt-3 font-body text-sm text-foreground">{selectedPlan.name}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    ${(selectedPlan.priceCentsPerMonth / 100).toFixed(2)} par mois — abonnement{' '}
                    {selectedPlan.billingMonths} mois
                  </p>
                  {discountPercent > 0 && (
                    <p className="mt-1 font-body text-xs text-verified">
                      Réduction ({discountPercent}%)
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                    <span className="font-body text-sm font-medium text-foreground">Total</span>
                    <span className="font-headings text-base font-bold text-foreground">
                      ${(selectedPlan.priceCentsTotal / 100).toFixed(2)}
                    </span>
                  </div>

                  <label className="mt-4 flex flex-col gap-1.5">
                    <span className="font-body text-xs font-medium text-foreground">
                      Méthode de paiement
                    </span>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                      className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={checkout}
                    disabled={submitting}
                    className="mt-4 w-full rounded-xl bg-primary py-3 font-headings text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {submitting ? 'Redirection…' : 'Passer au paiement'}
                  </button>
                  <Link
                    href="/app/decouvrir"
                    className="mt-2 block text-center font-body text-xs text-muted-foreground underline"
                  >
                    Continuer gratuitement
                  </Link>
                  <p className="mt-3 font-body text-xs text-muted-foreground">
                    Tu peux annuler ton abonnement dans Paramètres à tout moment.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
