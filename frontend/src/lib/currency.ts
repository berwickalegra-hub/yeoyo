// Local-currency display for the Credits shop (2026-08-25). Chariow charges
// the price of the product configured in ITS OWN dashboard — there is no
// USD-internal-reference-converted-to-local-currency step here (that would
// let the displayed price drift from what Chariow actually charges at
// checkout). `formatLocalPrice` only formats whatever `CreditPack.currency`
// / `priceTotal` (lib/server/credits/packs.ts) already is.
export type LocalCurrency = 'XOF';

export function formatLocalPrice(amount: number, currency: LocalCurrency): string {
  return `${amount.toLocaleString('fr-FR')} ${currency}`;
}
