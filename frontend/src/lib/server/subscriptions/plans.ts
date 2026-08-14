// Static plan catalog for Premium Checkout. Not a DB table — nothing in
// the mockup implies admin-editable pricing; promote to a
// `SubscriptionPlan` table if that ever changes.
//
// Pricing decision (2026-08-13): adopted verbatim from the Banani
// "Rencontres Sérieuses Congo" PremiumScreen mock (`l_YkRVFXx5e9`) per
// explicit user confirmation — CDF-native (Congolese Franc has no
// meaningful sub-unit, same "integer, smallest unit" convention as FCFA
// elsewhere in this kit), 4 tiers (was 3: Mensuel/6 Mois/Annuel in USD
// cents with a display-only CDF conversion — that USD layer and the old
// annual/monthly/semiannual ids are gone). `originalPriceCdfTotal` powers
// the struck-through "old price" the checkout UI shows next to each row.
import 'server-only';

export interface SubscriptionPlan {
  id: '15j' | '1m' | '3m' | '6m';
  name: string;
  durationLabel: string;
  /** Total charge for the whole period, in CDF (whole francs, no decimals). */
  priceCdfTotal: number;
  originalPriceCdfTotal: number;
  /** Effective per-month price, in CDF — what the plan row's price line shows. */
  priceCdfPerMonth: number;
  discountPct: number;
  /** Period length in days — used to compute Subscription.currentPeriodEnd. */
  billingDays: number;
  boosts: number;
  popular?: boolean;
}

export const PLANS: readonly SubscriptionPlan[] = [
  {
    id: '15j',
    name: 'Premium 15 Jours',
    durationLabel: '15 jours',
    priceCdfTotal: 16_000,
    originalPriceCdfTotal: 20_000,
    priceCdfPerMonth: 15_000,
    discountPct: 20,
    billingDays: 15,
    boosts: 1,
  },
  {
    id: '1m',
    name: 'Premium 1 Mois',
    durationLabel: '1 mois',
    priceCdfTotal: 11_000,
    originalPriceCdfTotal: 18_000,
    priceCdfPerMonth: 11_000,
    discountPct: 40,
    billingDays: 30,
    boosts: 3,
    popular: true,
  },
  {
    id: '3m',
    name: 'Premium 3 Mois',
    durationLabel: '3 mois',
    priceCdfTotal: 24_000,
    originalPriceCdfTotal: 36_000,
    priceCdfPerMonth: 8_000,
    discountPct: 33,
    billingDays: 90,
    boosts: 3,
  },
  {
    id: '6m',
    name: 'Premium 6 Mois',
    durationLabel: '6 mois',
    priceCdfTotal: 33_000,
    originalPriceCdfTotal: 72_000,
    priceCdfPerMonth: 5_500,
    discountPct: 49,
    billingDays: 180,
    boosts: 6,
  },
] as const;

export function getPlan(planId: string): SubscriptionPlan | undefined {
  return PLANS.find((p) => p.id === planId);
}
