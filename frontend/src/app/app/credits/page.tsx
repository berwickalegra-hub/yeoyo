// Credits Shop — rebuilt from the old Premium Checkout page (2026-08-25,
// replaces app/premium/page.tsx) now that YeOyo sells one-time, non-
// expiring credit packs instead of a recurring subscription (see
// lib/server/credits/ledger.ts / packs.ts). Same Chariow wiring as before:
// checkout collects a phone/country (Chariow needs it to open its hosted
// page) then redirects the browser externally to the `paymentUrl` Chariow
// returns — Mobile Money and card are both handled on Chariow's own hosted
// page, there's no separate in-app card UI here.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useCredits } from '@/contexts/CreditsContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon, type IconName } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { displayPrice, type LocalCurrency } from '@/lib/currency';
import { PHONE_COUNTRIES } from '@/lib/yeoyo/constants';

interface Pack {
  id: 'decouverte' | 'serieux' | 'determine' | 'engage';
  name: string;
  credits: number;
  currency: LocalCurrency;
  priceTotal: number;
  originalPriceTotal: number;
  discountPct: number;
  popular?: boolean;
  pricePerCredit: number;
}

const USES: { icon: IconName; title: string; cost: string }[] = [
  { icon: 'star', title: "Voir qui t'a mis en favori", cost: '1 crédit' },
  { icon: 'eye', title: 'Voir qui a visité ton profil', cost: '1 crédit' },
  { icon: 'zap', title: 'Boost de visibilité (24h)', cost: '3 crédits' },
  {
    icon: 'message-circle',
    title: '1er message après une demande acceptée',
    cost: '1 crédit (hommes)',
  },
];

const FAQ = [
  {
    q: 'Est-ce que mes crédits expirent ?',
    a: "Non. Un crédit acheté reste sur ton compte tant que tu ne l'utilises pas — pas d'abonnement, pas de reconduction, pas de date limite.",
  },
  {
    q: 'Quels modes de paiement sont acceptés ?',
    a: 'Mobile Money et carte bancaire, via notre partenaire de paiement sécurisé Chariow — tu choisis ton opérateur (Airtel Money, Orange Money, M-Pesa, etc. selon disponibilité) sur la page de paiement.',
  },
  {
    q: 'Que se passe-t-il si je manque de crédits ?',
    a: 'Tu peux revenir acheter un nouveau pack à tout moment — aucune action payante ne se lance jamais sans ta confirmation explicite du coût.',
  },
];

export default function CreditsPage() {
  const user = useUser();
  const { toast } = useToast();
  const { balance, unlimited, refresh: refreshCredits } = useCredits();
  const badgeCounts = useNavCounts();

  const [packs, setPacks] = useState<Pack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<Pack['id']>('serieux');
  const [phoneCountry, setPhoneCountry] = useState<(typeof PHONE_COUNTRIES)[number]['value']>('CD');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [profileCountry, setProfileCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [packsRes, meRes] = await Promise.all([
        api<{ packs: Pack[] }>('/api/credits/packs'),
        api<{
          savedPhone: { phone: string; phoneCountry: string } | null;
          profileCountry: string | null;
        }>('/api/credits/me'),
      ]);
      setPacks(packsRes.packs);
      const popular = packsRes.packs.find((p) => p.popular);
      if (popular) setSelectedPackId(popular.id);
      setProfileCountry(meRes.profileCountry);
      const savedPhone = meRes.savedPhone;
      if (savedPhone) {
        const knownCountry = PHONE_COUNTRIES.find((c) => c.value === savedPhone.phoneCountry);
        if (knownCountry) setPhoneCountry(knownCountry.value);
        setPhoneLocal(savedPhone.phone);
      } else {
        // No saved Chariow phone yet — default the country picker to the
        // buyer's own onboarding country instead of always "RD Congo".
        const knownCountry = PHONE_COUNTRIES.find((c) => c.value === meRes.profileCountry);
        if (knownCountry) setPhoneCountry(knownCountry.value);
      }
      void refreshCredits();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
    // refreshCredits is stable per-user (see CreditsContext) — omitted from
    // deps to avoid re-running load() on every balance change it triggers.
  }, [toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function checkout() {
    setSubmitting(true);
    try {
      const res = await api<{ orderId: string; paymentUrl: string }>('/api/credits/checkout', {
        method: 'POST',
        body: { packId: selectedPackId, phoneCountry, phoneLocal },
      });
      window.location.href = res.paymentUrl;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  const selectedPack = packs.find((p) => p.id === selectedPackId);

  return (
    <AppShell
      active="credits"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-6 lg:px-8 lg:py-8">
        {loading && <p className="font-body text-sm text-muted-foreground">Chargement…</p>}

        {!loading && (
          <>
            {/* Hero pitch */}
            <div className="credits-sales-hero -mx-5 rounded-b-2xl border-b border-gold/20 px-5 pb-8 pt-2 text-center lg:-mx-8 lg:px-8">
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-gold/15 px-3 py-1.5 font-body text-xs font-bold text-gold">
                <Icon name="gem" size={12} />
                {unlimited
                  ? 'Solde illimité'
                  : `Ton solde : ${balance} crédit${balance > 1 ? 's' : ''}`}
              </span>
              <h1 className="mt-4 font-headings text-2xl font-bold text-foreground lg:text-3xl">
                Des crédits à toi, pour toujours.
              </h1>
              <p className="mx-auto mt-3 max-w-lg font-body text-sm text-muted-foreground">
                Achète un pack une seule fois — utilise tes crédits quand tu veux, sans abonnement
                ni date d&apos;expiration.
              </p>
            </div>

            {/* Pack selection — 4 distinct cards, "Sérieux" highlighted as
                popular by default. */}
            <div>
              <h2 className="font-headings text-base font-bold text-foreground">
                Choisis ton pack
              </h2>
              <p className="mt-0.5 font-body text-xs text-muted-foreground">
                Plus le pack est grand, moins le crédit coûte cher
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {packs.map((pack) => {
                  const active = pack.id === selectedPackId;
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => setSelectedPackId(pack.id)}
                      className={`relative flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-colors ${
                        active ? 'border-gold bg-gold/5' : 'border-border bg-surface'
                      }`}
                    >
                      {pack.popular && (
                        <span className="absolute -top-2.5 right-4 flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 font-body text-[10px] font-bold text-gold-foreground">
                          <Icon name="zap" size={9} />
                          Populaire
                        </span>
                      )}
                      <div className="flex w-full items-center justify-between">
                        <span className="font-headings text-base font-bold text-foreground">
                          {pack.name}
                        </span>
                        <span className="rounded-md bg-verified/10 px-2 py-0.5 font-body text-[10px] font-bold text-verified">
                          -{pack.discountPct}%
                        </span>
                      </div>
                      <p className="font-body text-sm text-muted-foreground">
                        {pack.credits} crédits
                      </p>
                      <div className="flex items-baseline gap-2">
                        <span className="font-body text-xs text-muted-foreground line-through">
                          {displayPrice(pack.originalPriceTotal, profileCountry).primary}
                        </span>
                        <span
                          className={`font-headings text-xl font-bold ${active ? 'text-gold' : 'text-foreground'}`}
                        >
                          {displayPrice(pack.priceTotal, profileCountry).primary}
                        </span>
                      </div>
                      <p className="font-body text-[11px] text-muted-foreground">
                        Soit {displayPrice(pack.pricePerCredit, profileCountry).primary} / crédit
                      </p>
                      {(() => {
                        // RD Congo only: the prices above are an approximate
                        // conversion to Franc Congolais (rate is hand-set,
                        // not a live feed). This is the exact amount Chariow
                        // bills, in FCFA — shown so the buyer isn't
                        // surprised on Chariow's own checkout page. `charged`
                        // is null for the FCFA zone, where the price above
                        // already IS the charge.
                        const { charged } = displayPrice(pack.priceTotal, profileCountry);
                        if (!charged) return null;
                        return (
                          <span className="font-body text-[11px] text-muted-foreground">
                            Facturé {charged} par Chariow
                          </span>
                        );
                      })()}
                      <div
                        className={`mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                          active ? 'border-gold bg-gold' : 'border-border'
                        }`}
                      >
                        {active && <Icon name="check" size={12} className="text-gold-foreground" />}
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
            {selectedPack && (
              <div className="rounded-xl border border-gold/40 bg-gold/5 p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-body text-sm font-medium text-foreground">
                    Total à payer — {selectedPack.credits} crédits
                  </span>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="font-headings text-xl font-bold text-gold">
                      {displayPrice(selectedPack.priceTotal, profileCountry).primary}
                    </span>
                    {(() => {
                      const { charged } = displayPrice(selectedPack.priceTotal, profileCountry);
                      if (!charged) return null;
                      return (
                        <span className="font-body text-xs font-semibold text-muted-foreground">
                          Facturé {charged} par Chariow
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={checkout}
                  disabled={submitting || phoneLocal.trim().length < 4}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gold py-3.5 font-headings text-sm font-bold text-gold-foreground shadow-md shadow-gold/30 transition-transform active:scale-[0.99] disabled:opacity-50"
                >
                  <Icon name="gem" size={18} />
                  {submitting ? 'Redirection…' : 'Acheter ce pack'}
                </button>
                <div className="mt-3 flex items-center justify-center gap-4 font-body text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Icon name="zap" size={11} />
                    Crédits ajoutés instantanément
                  </span>
                  <span className="flex items-center gap-1">
                    <span aria-hidden="true">∞</span>
                    N&apos;expirent jamais
                  </span>
                </div>
                <Link
                  href="/app/decouvrir"
                  className="mt-3 block text-center font-body text-xs text-muted-foreground underline"
                >
                  Continuer sans acheter
                </Link>
              </div>
            )}

            {/* What credits unlock */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="font-headings text-base font-bold text-foreground">
                Ce que tes crédits débloquent
              </h2>
              <div className="mt-4 flex flex-col gap-4">
                {USES.map((f) => (
                  <div key={f.title} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                      <Icon name={f.icon} size={15} />
                    </div>
                    <div className="flex flex-1 items-center justify-between gap-2">
                      <p className="font-body text-sm font-semibold text-foreground">{f.title}</p>
                      <span className="flex-shrink-0 rounded-md bg-gold/10 px-2 py-0.5 font-body text-[11px] font-bold text-gold">
                        {f.cost}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 font-body text-xs text-muted-foreground">
                Tout le reste — répondre aux messages reçus, voir un profil, envoyer, accepter ou
                refuser une demande de contact — reste gratuit pour tout le monde.
              </p>
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
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
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
