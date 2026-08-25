// Static credit-pack catalog for the Credits shop (replaces the old
// Premium subscription plans.ts, 2026-08-25). Not a DB table — same
// reasoning as the old plans.ts: no admin-editable-packs requirement yet.
//
// These numbers are NOT arbitrary: Chariow charges the price of the
// product configured in ITS OWN dashboard (no override via the API — see
// Chariow.md §6, "Pas d'override de prix"), so `priceTotal`/`currency` here
// MUST mirror the real Chariow product exactly (confirmed live against
// `GET /products` on 2026-08-25 — see the 4 CHARIOW_PRODUCT_ID_* env vars).
// If the price is ever changed in the Chariow dashboard, it MUST be changed
// here too, or reconcile.ts's anti-fraud check (which compares against
// `pack.priceTotal`, not this store's own hosted-checkout amount) will
// start rejecting every real payment as an anomaly.
import 'server-only';

export interface CreditPack {
  id: 'decouverte' | 'serieux' | 'determine' | 'engage';
  name: string;
  credits: number;
  /** ISO 4217 code of the currency Chariow actually charges (XOF has no decimal subunit). */
  currency: 'XOF';
  /** Whole units of `currency` — matches the Chariow product's price exactly. */
  priceTotal: number;
  originalPriceTotal: number;
  discountPct: number;
  popular?: boolean;
}

export const PACKS: readonly CreditPack[] = [
  {
    id: 'decouverte',
    name: 'Découverte',
    credits: 5,
    currency: 'XOF',
    priceTotal: 600,
    originalPriceTotal: 900,
    discountPct: 33,
  },
  {
    id: 'serieux',
    name: 'Sérieux',
    credits: 15,
    currency: 'XOF',
    priceTotal: 1500,
    originalPriceTotal: 2400,
    discountPct: 38,
    popular: true,
  },
  {
    id: 'determine',
    name: 'Déterminé',
    credits: 35,
    currency: 'XOF',
    priceTotal: 3000,
    originalPriceTotal: 4800,
    discountPct: 38,
  },
  {
    id: 'engage',
    name: 'Engagé',
    credits: 80,
    currency: 'XOF',
    priceTotal: 6000,
    originalPriceTotal: 10800,
    discountPct: 44,
  },
] as const;

export function getPack(packId: string): CreditPack | undefined {
  return PACKS.find((p) => p.id === packId);
}

/** Whole units of `pack.currency` per credit, for the "prix/crédit" line on each pack card. */
export function pricePerCredit(pack: CreditPack): number {
  return Math.round(pack.priceTotal / pack.credits);
}
