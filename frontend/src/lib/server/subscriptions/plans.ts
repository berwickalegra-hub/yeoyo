// Static plan catalog for Premium Checkout. Not a DB table — nothing in
// the mockup implies admin-editable pricing; promote to a
// `SubscriptionPlan` table if that ever changes.
//
// REAL LAUNCH PRICING (2026-08-21, explicit user decision after confirming
// M-Pesa checkout works end-to-end via Chariow): 15j/3m/6m below are the
// real prices to charge at launch — 3 – 8 $/month-equivalent as decided.
// The '1m' plan is DELIBERATELY LEFT at its $1 test price for now (explicit
// user ask: "celui de 1 cela reste d'abord pour le test, tu vas le changer
// plus tard") — do not touch it until told to.
//
// ACTION REQUIRED before these prices go live: the Chariow dashboard
// products behind CHARIOW_PRODUCT_ID_15J/3M/6M (see chariow.ts's
// `getChariowProductId`) must be updated to charge these exact totals —
// reconcile.ts compares this file's price against what Chariow reports and
// REJECTS the charge (subscription never activates) if they differ by more
// than 5%. This file alone does not change what a customer is charged.
import 'server-only';

export interface SubscriptionPlan {
  id: '15j' | '1m' | '3m' | '6m';
  name: string;
  durationLabel: string;
  /** Total charge for the whole period, USD cents (100 = $1.00). Placeholder — see file header. */
  priceUsdCentsTotal: number;
  originalPriceUsdCentsTotal: number;
  /** Effective per-month price, USD cents — what the plan row's price line shows. */
  priceUsdCentsPerMonth: number;
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
    // Real launch price — the "essai découverte" tier, deliberately the
    // cheapest entry point. ACTION REQUIRED: match this on the Chariow
    // dashboard product behind CHARIOW_PRODUCT_ID_15J (see file header).
    priceUsdCentsTotal: 399,
    originalPriceUsdCentsTotal: 599,
    priceUsdCentsPerMonth: 799,
    discountPct: 33,
    billingDays: 15,
    boosts: 1,
  },
  {
    id: '1m',
    name: 'Premium 1 Mois',
    durationLabel: '1 mois',
    // TEMP TEST PRICE (2026-08-17, explicit user ask, reconfirmed
    // 2026-08-21: "celui de 1 cela reste d'abord pour le test, tu vas le
    // changer plus tard") — dropped from 699 to 100 ($1) so the account
    // owner can test the paid checkout flow without spending much. MUST be
    // paired with the same $1 price set on the matching product in the
    // Chariow dashboard — reconcile.ts compares this figure against what
    // Chariow actually reports and REJECTS the charge (subscription never
    // activates) if the two don't match within 5%. Do NOT change this plan
    // until the user explicitly asks — restore to a real price (and update
    // the Chariow product back) only then.
    priceUsdCentsTotal: 100,
    originalPriceUsdCentsTotal: 699,
    priceUsdCentsPerMonth: 100,
    discountPct: 43,
    billingDays: 30,
    boosts: 3,
    popular: true,
  },
  {
    id: '3m',
    name: 'Premium 3 Mois',
    durationLabel: '3 mois',
    // Real launch price. ACTION REQUIRED: match this on the Chariow
    // dashboard product behind CHARIOW_PRODUCT_ID_3M (see file header).
    priceUsdCentsTotal: 1199,
    originalPriceUsdCentsTotal: 1799,
    priceUsdCentsPerMonth: 400,
    discountPct: 33,
    billingDays: 90,
    boosts: 3,
  },
  {
    id: '6m',
    name: 'Premium 6 Mois',
    durationLabel: '6 mois',
    // Real launch price — explicit user ask: "diminue encore le prix, je
    // veux le 6 mois soit 18$". ACTION REQUIRED: match this on the Chariow
    // dashboard product behind CHARIOW_PRODUCT_ID_6M (see file header).
    priceUsdCentsTotal: 1800,
    originalPriceUsdCentsTotal: 2999,
    priceUsdCentsPerMonth: 300,
    discountPct: 40,
    billingDays: 180,
    boosts: 6,
  },
] as const;

export function getPlan(planId: string): SubscriptionPlan | undefined {
  return PLANS.find((p) => p.id === planId);
}
