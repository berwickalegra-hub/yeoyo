// Premium Checkout — rebuilt from the "Rencontres Sérieuses Congo" Banani
// flow's PremiumScreen.jsx (2026-08-13, premium-nouveau-theme.md), then
// rewired for the Chariow payment integration: the 4-tier plan catalog
// (15j/1m/3m/6m, see lib/server/subscriptions/plans.ts) is priced in USD
// cents, and checkout collects a phone/country (Chariow needs it to open
// its hosted page) then redirects the browser externally to the
// `paymentUrl` Chariow returns. Mobile Money and card are both handled on
// Chariow's own hosted page — there's no separate in-app card UI here.
//
// Flagged departures from the mock: "J'ai un code promo" (no promo-code
// backend exists) and the testimonial carousel (static dots, no real
// rotation, redundant with the landing page's own testimonials) are
// omitted rather than shipped as fake affordances. The existing
// free-vs-premium comparison table (real, useful content, not in Banani's
// mock) is kept.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon, type IconName } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';

interface Plan {
  id: '15j' | '1m' | '3m' | '6m';
  name: string;
  durationLabel: string;
  priceUsdCentsTotal: number;
  originalPriceUsdCentsTotal: number;
  priceUsdCentsPerMonth: number;
  discountPct: number;
  billingDays: number;
  boosts: number;
  popular?: boolean;
}

function formatUsd(cents: number): string {
  return `${(cents / 100).toFixed(2)} $`;
}

interface SubscriptionInfo {
  planName: string;
  status: string;
  currentPeriodEnd: string | null;
}

function formatExpiryDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const PHONE_COUNTRIES = [
  { value: 'CD', label: 'RD Congo (+243)' },
  { value: 'SN', label: 'Sénégal (+221)' },
  { value: 'CI', label: "Côte d'Ivoire (+225)" },
  { value: 'BJ', label: 'Bénin (+229)' },
  { value: 'TG', label: 'Togo (+228)' },
  { value: 'CM', label: 'Cameroun (+237)' },
] as const;

const FEATURES: { icon: IconName; title: string; desc: string; badge?: string }[] = [
  {
    icon: 'star',
    title: "Vois qui t'a mis en favori",
    desc: 'Découvre toutes les personnes qui te trouvent intéressant(e).',
  },
  {
    icon: 'eye',
    title: 'Découvre qui te repère',
    desc: 'Identifie en un clic qui visite ton profil. Fini les doutes.',
  },
  {
    icon: 'message-circle',
    title: 'Contacte sans limite',
    desc: 'Tu as flashé sur un profil ? Écris-lui maintenant, sans attendre demain.',
  },
  {
    icon: 'trending-up',
    title: 'Vois qui est connecté',
    desc: 'Repère les profils actifs en temps réel. Écris au bon moment.',
    badge: 'Nouveau',
  },
  {
    icon: 'crown',
    title: 'Sois vu(e) en premier',
    desc: 'Ton profil apparaît en tête de recherches.',
  },
  {
    icon: 'zap',
    title: 'Boosts de profil inclus',
    desc: 'Propulse ton profil en première position pendant 24h.',
  },
];

const COMPARISON_ROWS: { feature: string; free: string | boolean; premium: string | boolean }[] = [
  { feature: 'Demandes de contact', free: '5 / mois', premium: 'Illimitées' },
  { feature: 'Voir qui vous a mis en favori', free: false, premium: true },
  { feature: 'Voir qui a visité votre profil', free: false, premium: true },
  { feature: 'Messagerie', free: '3 messages / jour', premium: 'Illimitée' },
  { feature: 'Boosts de profil', free: '1 / 24h', premium: true },
  { feature: 'Badge Premium', free: false, premium: true },
  { feature: 'Support prioritaire', free: false, premium: true },
];

const FAQ = [
  {
    q: 'Quels modes de paiement sont acceptés ?',
    a: 'Mobile Money et carte bancaire, via notre partenaire de paiement sécurisé Chariow — tu choisis ton opérateur (Airtel Money, Orange Money, M-Pesa, etc. selon disponibilité) sur la page de paiement.',
  },
  {
    q: 'Mon paiement est-il sécurisé ?',
    a: 'Oui, chaque transaction passe par notre prestataire de paiement certifié.',
  },
  {
    q: 'Puis-je annuler mon abonnement ?',
    // No auto-renewal exists in this app — each plan is a one-time,
    // fixed-length purchase, so there's nothing to "cancel" mid-period; it
    // simply expires. The old answer promised a cancel flow that never
    // existed anywhere in the app (2026-08-17 audit finding).
    a: "Il n'y a pas de prélèvement automatique : chaque plan est un achat unique pour une durée fixe. Ton accès Premium reste actif jusqu'à la fin de la période payée, puis s'arrête automatiquement — tu n'as rien à annuler.",
  },
];

export default function PremiumPage() {
  const user = useUser();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<Plan['id']>('1m');
  const [phoneCountry, setPhoneCountry] = useState<(typeof PHONE_COUNTRIES)[number]['value']>('CD');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, subRes] = await Promise.all([
        api<{ plans: Plan[] }>('/api/subscriptions/plans'),
        api<{
          subscription: SubscriptionInfo | null;
          savedPhone: { phone: string; phoneCountry: string } | null;
        }>('/api/subscriptions/me'),
      ]);
      setPlans(plansRes.plans);
      const popular = plansRes.plans.find((p) => p.popular);
      if (popular) setSelectedPlanId(popular.id);
      setSubscription(subRes.subscription);
      const savedPhone = subRes.savedPhone;
      if (savedPhone) {
        const knownCountry = PHONE_COUNTRIES.find((c) => c.value === savedPhone.phoneCountry);
        if (knownCountry) setPhoneCountry(knownCountry.value);
        setPhoneLocal(savedPhone.phone);
      }
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
      const res = await api<{ orderId: string; paymentUrl: string }>(
        '/api/subscriptions/checkout',
        {
          method: 'POST',
          body: { planId: selectedPlanId, phoneCountry, phoneLocal },
        },
      );
      window.location.href = res.paymentUrl;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  return (
    <AppShell
      active="premium"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-6 lg:px-8 lg:py-8">
        {loading && <p className="font-body text-sm text-muted-foreground">Chargement…</p>}

        {!loading && subscription?.status === 'ACTIVE' && (
          <div className="rounded-xl border border-verified bg-surface p-6 text-center">
            <p className="font-headings text-lg font-bold text-foreground">
              Tu es déjà Premium ({subscription.planName})
            </p>
            {subscription.currentPeriodEnd && (
              <p className="mt-1 font-body text-sm text-muted-foreground">
                Actif jusqu&rsquo;au {formatExpiryDate(subscription.currentPeriodEnd)}
              </p>
            )}
            <Link
              href="/app/parametres/paiement"
              className="mt-4 inline-block text-sm text-primary underline"
            >
              Retour aux paramètres
            </Link>
          </div>
        )}

        {!loading && subscription?.status !== 'ACTIVE' && (
          <>
            {/* Hero pitch */}
            <div className="border-b border-border pb-8 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 font-body text-xs font-bold text-primary">
                <Icon name="shield-check" size={12} />
                Sérieux, vérifié à la main
              </span>
              <h1 className="mt-4 font-headings text-2xl font-bold text-foreground lg:text-3xl">
                Ta future moitié t&rsquo;attend. Ne la rate pas.
              </h1>
              <p className="mx-auto mt-3 max-w-lg font-body text-sm text-muted-foreground">
                Sans Premium, ton profil reste noyé. Avec Premium, tu apparais en premier, tu vois
                qui s&rsquo;intéresse à toi, et tu réponds sans limite.
              </p>
              <div className="mx-auto mt-6 flex max-w-sm items-center justify-center divide-x divide-border">
                {[
                  { value: '3×', label: 'plus de réponses' },
                  { value: '50 000+', label: 'profils vérifiés' },
                  { value: '100%', label: 'profils contrôlés' },
                ].map((s) => (
                  <div key={s.label} className="flex-1 px-2 text-center">
                    <p className="font-headings text-lg font-bold text-primary">{s.value}</p>
                    <p className="font-body text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Plan selection */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-headings text-base font-bold text-foreground">
                Choisis ta durée
              </h2>
              <p className="mt-0.5 font-body text-xs text-muted-foreground">
                Plus c&rsquo;est long, plus tu économises
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {plans.map((plan) => {
                  const active = plan.id === selectedPlanId;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left ${
                        active ? 'border-primary bg-primary/5' : 'border-border bg-background'
                      }`}
                    >
                      <div
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                          active ? 'border-primary bg-primary' : 'border-border'
                        }`}
                      >
                        {active && (
                          <Icon name="check" size={12} className="text-primary-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-body text-sm font-semibold text-foreground">
                            {plan.name}
                          </span>
                          {plan.popular && (
                            <span className="rounded-md bg-secondary px-2 py-0.5 font-body text-[10px] font-bold text-secondary-foreground">
                              Populaire
                            </span>
                          )}
                          <span className="rounded-md bg-verified/10 px-2 py-0.5 font-body text-[10px] font-bold text-verified">
                            -{plan.discountPct}%
                          </span>
                        </div>
                        <p className="mt-0.5 font-body text-xs text-muted-foreground">
                          {formatUsd(plan.priceUsdCentsPerMonth)}/mois · +{plan.boosts} boost
                          {plan.boosts > 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="font-body text-xs text-muted-foreground line-through">
                          {formatUsd(plan.originalPriceUsdCentsTotal)}
                        </p>
                        <p
                          className={`font-headings text-base font-bold ${active ? 'text-primary' : 'text-foreground'}`}
                        >
                          {formatUsd(plan.priceUsdCentsTotal)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Phone — required by Chariow to open the hosted checkout */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-headings text-base font-bold text-foreground">
                Ton numéro Mobile Money
              </h2>
              <p className="mt-0.5 font-body text-xs text-muted-foreground">
                Sur la page de paiement sécurisée suivante, tu choisiras Mobile Money (Airtel Money,
                Orange Money, M-Pesa, etc. selon disponibilité) ou la carte bancaire.
              </p>
              <div className="mt-4 flex gap-2">
                <select
                  value={phoneCountry}
                  onChange={(e) => setPhoneCountry(e.target.value as typeof phoneCountry)}
                  className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
                >
                  {PHONE_COUNTRIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phoneLocal}
                  onChange={(e) => setPhoneLocal(e.target.value)}
                  placeholder="810 000 000"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
                />
              </div>
            </div>

            {/* Total + CTA */}
            {selectedPlan && (
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <span className="font-body text-sm font-medium text-foreground">
                    Total à payer
                  </span>
                  <span className="font-headings text-xl font-bold text-foreground">
                    {formatUsd(selectedPlan.priceUsdCentsTotal)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={checkout}
                  disabled={submitting || phoneLocal.trim().length < 4}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gold py-3.5 font-headings text-sm font-bold text-gold-foreground disabled:opacity-50"
                >
                  <Icon name="crown" size={18} />
                  {submitting ? 'Redirection…' : 'Devenir membre Premium'}
                </button>
                <div className="mt-3 flex items-center justify-center gap-4 font-body text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Icon name="zap" size={11} />
                    Activation instantanée
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="x-circle" size={11} />
                    Annulable à tout moment
                  </span>
                </div>
                <Link
                  href="/app/decouvrir"
                  className="mt-3 block text-center font-body text-xs text-muted-foreground underline"
                >
                  Continuer gratuitement
                </Link>
              </div>
            )}

            {/* Features unlocked */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-headings text-base font-bold text-foreground">
                Ce que Premium débloque pour toi
              </h2>
              <div className="mt-4 flex flex-col gap-4">
                {FEATURES.map((f) => (
                  <div key={f.title} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10 text-primary">
                      <Icon name={f.icon} size={15} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="font-body text-sm font-semibold text-foreground">{f.title}</p>
                        {f.badge && (
                          <span className="rounded-md bg-secondary px-1.5 py-0.5 font-body text-[10px] font-bold text-secondary-foreground">
                            {f.badge}
                          </span>
                        )}
                      </div>
                      <p className="font-body text-xs text-muted-foreground">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Comparison table — real content, not in the Banani mock, kept */}
            <div>
              <h3 className="mb-3 font-headings text-base font-bold text-foreground">
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

            {/* FAQ */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-headings text-base font-bold text-foreground">
                Questions fréquentes
              </h2>
              <div className="mt-4 flex flex-col divide-y divide-border">
                {FAQ.map((item) => (
                  <div key={item.q} className="py-3 first:pt-0 last:pb-0">
                    <p className="font-body text-sm font-semibold text-foreground">{item.q}</p>
                    <p className="mt-1 font-body text-xs text-muted-foreground">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust footer */}
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-verified/10 text-verified">
                  <Icon name="shield-check" size={16} />
                </div>
                <div>
                  <p className="font-body text-sm font-semibold text-foreground">
                    Paiement 100% sécurisé
                  </p>
                  <p className="font-body text-xs text-muted-foreground">
                    YeOyo & Chariow certifiés
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon name="user-check" size={16} />
                </div>
                <div>
                  <p className="font-body text-sm font-semibold text-foreground">
                    Profils vérifiés manuellement
                  </p>
                  <p className="font-body text-xs text-muted-foreground">
                    Notre équipe valide chaque inscription
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
