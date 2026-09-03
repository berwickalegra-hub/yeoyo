// Local-currency display for the Credits shop (2026-08-25). Chariow charges
// the price of the product configured in ITS OWN dashboard — there is no
// USD-internal-reference-converted-to-local-currency step here (that would
// let the displayed price drift from what Chariow actually charges at
// checkout). The XOF number in lib/server/credits/packs.ts is always the
// real charge, in every country. For a buyer outside the XOF zone (only
// RD Congo, among the supported countries) we show a clearly-marked "≈"
// figure in their own currency AND keep the exact XOF charge visible.
export type LocalCurrency = 'XOF' | 'XAF' | 'CDF';

// What people actually call these on the street: XOF and XAF are both the
// "Franc CFA" (pegged 1:1 by treaty), universally written "FCFA"; CDF is
// the "Franc Congolais", written "FC". The ISO codes stay as the internal
// type — only the rendered label changes (2026-08-31, explicit user ask).
const CURRENCY_LABELS: Record<LocalCurrency, string> = {
  XOF: 'FCFA',
  XAF: 'FCFA',
  CDF: 'FC',
};

export function formatLocalPrice(amount: number, currency: LocalCurrency): string {
  return `${amount.toLocaleString('fr-FR')} ${CURRENCY_LABELS[currency]}`;
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

export interface PriceDisplay {
  /** The price to show prominently, in the buyer's own currency. Prefixed
   *  with "≈ " when it is a floating-rate estimate (RD Congo only). */
  primary: string;
  /** The exact amount Chariow will charge, in FCFA — shown as a small note
   *  under `primary` ONLY when it differs from it (RD Congo). `null` for the
   *  XOF zone, where `primary` already IS the charged amount. */
  charged: string | null;
}

/**
 * How to render one pack price to a buyer from `countryCode` on the Credits
 * shop. `xofAmount` is the pack's price from packs.ts (always XOF).
 *
 * - RD Congo → `primary` is the "≈ … FC" estimate, `charged` is the real
 *   "… FCFA" so the buyer isn't surprised on Chariow's page.
 * - Everywhere else (XOF zone + Cameroun) → `primary` is the exact "… FCFA",
 *   `charged` is `null`.
 */
export function displayPrice(xofAmount: number, countryCode: string | null): PriceDisplay {
  const est = estimateLocalPrice(xofAmount, countryCode);
  if (est.approximate) {
    return {
      primary: `≈ ${formatLocalPrice(est.amount, est.currency)}`,
      charged: formatLocalPrice(xofAmount, 'XOF'),
    };
  }
  return { primary: formatLocalPrice(est.amount, est.currency), charged: null };
}
