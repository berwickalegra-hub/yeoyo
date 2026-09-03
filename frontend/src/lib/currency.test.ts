import { describe, it, expect } from 'vitest';
import { formatLocalPrice, estimateLocalPrice, displayPrice } from './currency';

// `toLocaleString('fr-FR')` groups thousands with a narrow no-break space
// (U+202F), not an ASCII space. Derive it here so the expectations match
// whatever the runtime actually emits (the browser renders the same).
const T = (1500).toLocaleString('fr-FR').replace(/\d/g, '');

describe('formatLocalPrice — friendly currency names', () => {
  it('shows XOF and XAF both as "FCFA" (the name used across the CFA zone)', () => {
    expect(formatLocalPrice(1500, 'XOF')).toBe(`1${T}500 FCFA`);
    expect(formatLocalPrice(1500, 'XAF')).toBe(`1${T}500 FCFA`);
  });

  it('shows CDF as "FC" (Franc Congolais)', () => {
    expect(formatLocalPrice(7050, 'CDF')).toBe(`7${T}050 FC`);
  });

  it('groups thousands the French way', () => {
    expect(formatLocalPrice(6000, 'XOF')).toBe(`6${T}000 FCFA`);
  });
});

describe('estimateLocalPrice — one row per supported country', () => {
  it('RD Congo maps to an approximate CDF figure', () => {
    expect(estimateLocalPrice(1500, 'CD')).toEqual({
      amount: Math.round(1500 * 4.7),
      currency: 'CDF',
      approximate: true,
    });
  });

  it('Cameroun maps to exact XAF (1:1 with XOF, just relabeled)', () => {
    expect(estimateLocalPrice(1500, 'CM')).toEqual({
      amount: 1500,
      currency: 'XAF',
      approximate: false,
    });
  });

  it('Cote d Ivoire / Senegal / Benin / Togo / unknown map to exact XOF', () => {
    for (const c of ['CI', 'SN', 'BJ', 'TG', null, 'ZZ']) {
      expect(estimateLocalPrice(1500, c)).toEqual({
        amount: 1500,
        currency: 'XOF',
        approximate: false,
      });
    }
  });
});

describe('displayPrice — what the Credits shop renders per buyer country', () => {
  it('RD Congo leads with an approximate FC amount and keeps the real FCFA charge as a note', () => {
    expect(displayPrice(1500, 'CD')).toEqual({
      primary: `≈ 7${T}050 FC`,
      charged: `1${T}500 FCFA`,
    });
  });

  it('Cameroun shows FCFA only, no separate charge note (the amount is exact)', () => {
    expect(displayPrice(1500, 'CM')).toEqual({ primary: `1${T}500 FCFA`, charged: null });
  });

  it('Cote d Ivoire and the rest of the XOF zone show FCFA only', () => {
    expect(displayPrice(1500, 'CI')).toEqual({ primary: `1${T}500 FCFA`, charged: null });
    expect(displayPrice(600, 'SN')).toEqual({ primary: '600 FCFA', charged: null });
    expect(displayPrice(3000, null)).toEqual({ primary: `3${T}000 FCFA`, charged: null });
  });

  it('the charge note is always the XOF pack price, never the converted figure', () => {
    expect(displayPrice(6000, 'CD').charged).toBe(`6${T}000 FCFA`);
  });
});
