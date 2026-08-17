// Static plan catalog for Premium Checkout. Not a DB table — nothing in
// the mockup implies admin-editable pricing; promote to a
// `SubscriptionPlan` table if that ever changes.
//
// PRICING IS A PLACEHOLDER (2026-08-16): re-priced from the original
// CDF-native catalog into USD cents because the platform's Chariow
// boutique bills in USD (Chariow charges the exact price of the product
// configured in its own dashboard — see chariow.ts's module doc). These
// numbers are NOT a business decision — before going live, create 4
// products in the Chariow dashboard with real prices, point
// CHARIOW_PRODUCT_ID_15J/1M/3M/6M at them (see chariow.ts's
// `getChariowProductId`), and update the values below to match.
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
    // TEMP TEST PRICE (2026-08-17, explicit user ask): dropped from 599 to
    // 100 ($1) so the account owner can test the paid checkout flow without
    // spending much. MUST be paired with the same $1 price set on the
    // matching product in the Chariow dashboard — reconcile.ts compares
    // this figure against what Chariow actually reports and REJECTS the
    // charge (subscription never activates) if the two don't match within
    // 5%. Restore to a real price (and update the Chariow product back)
    // before going live.
    priceUsdCentsTotal: 100,
    originalPriceUsdCentsTotal: 799,
    priceUsdCentsPerMonth: 1199,
    discountPct: 25,
    billingDays: 15,
    boosts: 1,
  },
  {
    id: '1m',
    name: 'Premium 1 Mois',
    durationLabel: '1 mois',
    // TEMP TEST PRICE — see the '15j' plan's comment above; same caveat
    // applies (must match the Chariow dashboard product price).
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
    priceUsdCentsTotal: 899,
    originalPriceUsdCentsTotal: 1499,
    priceUsdCentsPerMonth: 299,
    discountPct: 40,
    billingDays: 90,
    boosts: 3,
  },
  {
    id: '6m',
    name: 'Premium 6 Mois',
    durationLabel: '6 mois',
    priceUsdCentsTotal: 1499,
    originalPriceUsdCentsTotal: 2999,
    priceUsdCentsPerMonth: 249,
    discountPct: 50,
    billingDays: 180,
    boosts: 6,
  },
] as const;

export function getPlan(planId: string): SubscriptionPlan | undefined {
  return PLANS.find((p) => p.id === planId);
}
