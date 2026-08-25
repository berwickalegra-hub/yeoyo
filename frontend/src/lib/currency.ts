// Local-currency display for the Credits shop (2026-08-25). Chariow charges
// the price of the product configured in ITS OWN dashboard — there is no
// USD-internal-reference-converted-to-local-currency step here (that would
// let the displayed price drift from what Chariow actually charges at
// checkout). `formatLocalPrice` only formats whatever `CreditPack.currency`
// / `priceTotal` (lib/server/credits/packs.ts) already is — that number is
// always the real charge, in every country.
export type LocalCurrency = 'XOF' | 'XAF' | 'CDF';

export function formatLocalPrice(amount: number, currency: LocalCurrency): string {
  return `${amount.toLocaleString('fr-FR')} ${currency}`;
}

export interface LocalEstimate {
  amount: number;
  currency: LocalCurrency;
  /**
   * false for XOF/XAF — those are the same Franc CFA pegged 1:1 to each
   * other by treaty, so a Cameroun buyer's XAF figure is the exact charge,
   * just relabeled. true only for CDF (RDC's currency floats freely against
   * XOF) — a rough preview to help a buyer gauge the price BEFORE Chariow's
   * own checkout page shows the precise, real-time converted amount. Never
   * feed this into payment or anti-fraud logic — packs.ts's XOF price stays
   * the only real reference there.
   */
  approximate: boolean;
}

// Approximate, hand-set — not a live feed (matches this project's "no new
// technology" constraint). Revisit if it drifts noticeably from Chariow's
// own checkout-page conversion.
const XOF_TO_CDF_RATE = 4.7;

/** Preview-only local-currency estimate of an XOF pack price, keyed by the buyer's onboarding country. */
export function estimateLocalPrice(xofAmount: number, countryCode: string | null): LocalEstimate {
  if (countryCode === 'CD') {
    return { amount: Math.round(xofAmount * XOF_TO_CDF_RATE), currency: 'CDF', approximate: true };
  }
  if (countryCode === 'CM') {
    return { amount: xofAmount, currency: 'XAF', approximate: false };
  }
  return { amount: xofAmount, currency: 'XOF', approximate: false };
}
