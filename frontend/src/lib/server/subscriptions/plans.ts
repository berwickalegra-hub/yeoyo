// Static plan catalog for Premium Checkout. Not a DB table — Banani shows a
// fixed 3-plan catalog and nothing in the mockup implies admin-editable
// pricing; promote to a `SubscriptionPlan` table if that ever changes.
//
// Pricing decision (flagged, not from the mockup): Banani prices in "FC"
// (2 500 / 12 500 / 20 000 FC for Mensuel/6 Mois/Annuel) but per
// IMPLEMENTATION-PLAN.md §4 the actual charge currency is USD (Stripe is
// USD-native; Moneroo's DRC/CDF settlement is still unconfirmed) — CDF is
// display-only. The USD prices below are a placeholder chosen to match the
// mockup's discount shape (6-month ≈ 25% off monthly, annual ≈ 40% off)
// rather than a real pricing decision — revisit once real billing is wired.
import 'server-only';

export interface SubscriptionPlan {
  id: 'monthly' | 'semiannual' | 'annual';
  name: string;
  /** Total charge for the whole period, in USD cents. */
  priceCentsTotal: number;
  /** Effective per-month price, in USD cents — what the pricing card shows. */
  priceCentsPerMonth: number;
  billingMonths: number;
  badge?: string;
  features: string[];
}

export const PLANS: readonly SubscriptionPlan[] = [
  {
    id: 'monthly',
    name: 'Plan Mensuel',
    priceCentsTotal: 499,
    priceCentsPerMonth: 499,
    billingMonths: 1,
    features: [
      '+20 demandes de contact',
      'Voir les likes reçus',
      'Filtres avancés',
      'Chat illimité',
      'Pas de publicités',
    ],
  },
  {
    id: 'semiannual',
    name: 'Plan 6 Mois',
    priceCentsTotal: 2250,
    priceCentsPerMonth: 375,
    billingMonths: 6,
    badge: 'Meilleure valeur',
    features: [
      '+20 demandes de contact',
      'Voir les likes reçus',
      'Filtres avancés',
      'Chat illimité',
      'Pas de publicités',
      'Badge Premium visible',
      'Support prioritaire',
    ],
  },
  {
    id: 'annual',
    name: 'Plan Annuel',
    priceCentsTotal: 3588,
    priceCentsPerMonth: 299,
    billingMonths: 12,
    badge: 'Meilleure offre',
    features: [
      '+20 demandes de contact',
      'Voir les likes reçus',
      'Filtres avancés',
      'Chat illimité',
      'Pas de publicités',
      'Badge Premium visible',
      'Support prioritaire',
      'Reboost mensuel gratuit',
    ],
  },
] as const;

export function getPlan(planId: string): SubscriptionPlan | undefined {
  return PLANS.find((p) => p.id === planId);
}

// Illustrative display-only rate — NOT used for any charge math, NOT a
// live FX rate. Remove once Moneroo's actual DRC settlement currency is
// confirmed (IMPLEMENTATION-PLAN.md §4 open risk).
export const USD_TO_CDF_DISPLAY_RATE = 2500;

export function usdCentsToCdfDisplay(cents: number): number {
  return Math.round((cents / 100) * USD_TO_CDF_DISPLAY_RATE);
}
