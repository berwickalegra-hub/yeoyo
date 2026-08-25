import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mapChariowStatus,
  resolveChariowPhone,
  charge,
  getSaleStatus,
  getChariowProductId,
  chariowWebhookProvider,
} from './chariow';

const ENV = {
  CHARIOW_API_URL: 'https://api.chariow.test',
  CHARIOW_API_KEY: 'test-key',
  CHARIOW_WEBHOOK_SECRET: 'test-secret',
};

describe('mapChariowStatus', () => {
  it('maps "unpaid" to pending, never to succeeded (unpaid contains paid)', () => {
    expect(mapChariowStatus('unpaid')).toBe('pending');
  });
  it('maps settle/complete/paid/success to succeeded', () => {
    expect(mapChariowStatus('settled')).toBe('succeeded');
    expect(mapChariowStatus('complete')).toBe('succeeded');
    expect(mapChariowStatus('paid')).toBe('succeeded');
    expect(mapChariowStatus('success')).toBe('succeeded');
  });
  it('maps failed/error to failed', () => {
    expect(mapChariowStatus('failed')).toBe('failed');
    expect(mapChariowStatus('error')).toBe('failed');
  });
  it('maps cancel/abandon/refund to abandoned', () => {
    expect(mapChariowStatus('cancelled')).toBe('abandoned');
    expect(mapChariowStatus('abandoned')).toBe('abandoned');
    expect(mapChariowStatus('refunded')).toBe('abandoned');
  });
  it('maps unknown/undefined to pending', () => {
    expect(mapChariowStatus(undefined)).toBe('pending');
    expect(mapChariowStatus('processing')).toBe('pending');
  });
});

describe('resolveChariowPhone', () => {
  it('resolves phoneCountry + phoneLocal via libphonenumber (strips leading 0)', () => {
    const r = resolveChariowPhone({ phoneCountry: 'CD', phoneLocal: '0810000000' });
    expect(r).toEqual({ number: '810000000', countryCode: 'CD' });
  });
  it('resolves a bare E.164 phone, deducing country', () => {
    const r = resolveChariowPhone({ phone: '+221771234567' });
    expect(r).toEqual({ number: '771234567', countryCode: 'SN' });
  });
  it('falls back to raw digits when phoneCountry + phoneLocal do not validate strictly', () => {
    const r = resolveChariowPhone({ phoneCountry: 'BJ', phoneLocal: '97000000' });
    expect(r).not.toBeNull();
    expect(r?.countryCode).toBe('BJ');
  });
  it('falls back to the African dial-code table for a raw E.164-ish DRC number with no country hint', () => {
    const r = resolveChariowPhone({ phone: '00243810000000' });
    expect(r).toEqual({ number: '810000000', countryCode: 'CD' });
  });
  it('returns null when nothing resolves', () => {
    expect(resolveChariowPhone({})).toBeNull();
  });
});

describe('getChariowProductId', () => {
  beforeEach(() => {
    vi.stubEnv('CHARIOW_PRODUCT_ID_SERIEUX', 'prod_123');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('reads the pack-specific env var', () => {
    expect(getChariowProductId('serieux')).toBe('prod_123');
  });
  it('returns null when unset', () => {
    expect(getChariowProductId('determine')).toBeNull();
  });
});

describe('charge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the Chariow-shaped body and parses the enveloped response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          purchase: { id: 'sale_1', amount: { value: 5.99, currency: 'USD' } },
          payment: { checkout_url: 'https://chariow.test/pay/sale_1' },
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await charge(ENV, {
      productId: 'prod_123',
      email: 'a@b.com',
      firstName: 'Ruth',
      lastName: 'Thiala',
      phone: { number: '810000000', countryCode: 'CD' },
      redirectUrl: 'https://yeoyo.test/app/premium/pending?orderId=o1',
    });

    expect(result).toEqual({
      saleId: 'sale_1',
      checkoutUrl: 'https://chariow.test/pay/sale_1',
      amount: 599,
      currency: 'USD',
    });
    const call = fetchMock.mock.calls[0];
    const [url, init] = call as unknown as [string, RequestInit];
    expect(url).toBe('https://api.chariow.test/checkout');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      product_id: 'prod_123',
      email: 'a@b.com',
      first_name: 'Ruth',
      last_name: 'Thiala',
      phone: { number: '810000000', country_code: 'CD' },
      redirect_url: 'https://yeoyo.test/app/premium/pending?orderId=o1',
    });
  });

  it('throws (never silently charges 0) when the amount is missing or non-numeric', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            purchase: { id: 'sale_1', amount: { currency: 'USD' } },
            payment: { checkout_url: 'https://chariow.test/pay/sale_1' },
          },
        }),
      })),
    );
    await expect(
      charge(ENV, {
        productId: 'prod_123',
        email: 'a@b.com',
        firstName: 'Ruth',
        lastName: 'Thiala',
        phone: { number: '810000000', countryCode: 'CD' },
        redirectUrl: 'https://yeoyo.test/x',
      }),
    ).rejects.toThrow(/non-numeric amount/);
  });

  it('throws with the response body on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 422, text: async () => 'invalid discount_code' })),
    );
    await expect(
      charge(ENV, {
        productId: 'prod_123',
        email: 'a@b.com',
        firstName: 'Ruth',
        lastName: 'Thiala',
        phone: { number: '810000000', countryCode: 'CD' },
        redirectUrl: 'https://yeoyo.test/x',
      }),
    ).rejects.toThrow(/422/);
  });
});

describe('getSaleStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses status/amount/settledAt from the enveloped response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            status: 'settled',
            amount: { value: 5.99, currency: 'USD' },
            settled_at: '2026-08-16T10:00:00.000Z',
          },
        }),
      })),
    );
    const result = await getSaleStatus(ENV, 'sale_1');
    expect(result).toEqual({
      status: 'succeeded',
      amount: 599,
      currency: 'USD',
      settledAt: new Date('2026-08-16T10:00:00.000Z'),
    });
  });

  it('throws when the sale amount is missing or non-numeric', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: { status: 'settled', amount: { currency: 'USD' } } }),
      })),
    );
    await expect(getSaleStatus(ENV, 'sale_1')).rejects.toThrow(/non-numeric amount/);
  });

  it('returns settledAt: null when no date field is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: { status: 'unpaid', amount: { value: 5.99, currency: 'USD' } },
        }),
      })),
    );
    const result = await getSaleStatus(ENV, 'sale_1');
    expect(result.status).toBe('pending');
    expect(result.settledAt).toBeNull();
  });
});

describe('chariowWebhookProvider', () => {
  it('verifySignature always returns valid (secret is checked in the route, not here)', () => {
    expect(chariowWebhookProvider.verifySignature(Buffer.from('{}'), {})).toEqual({ valid: true });
  });

  it('extractIds reads the sale id and classifies settled.sale as paid', () => {
    const payload = chariowWebhookProvider.parsePayload(
      Buffer.from(JSON.stringify({ event: 'settled.sale', data: { id: 'sale_1' } })),
    );
    expect(chariowWebhookProvider.extractIds(payload)).toEqual({
      externalId: 'sale_1',
      eventType: 'settled.sale',
      kind: 'paid',
    });
  });

  it('extractIds classifies an unknown event as other', () => {
    const payload = chariowWebhookProvider.parsePayload(
      Buffer.from(JSON.stringify({ event: 'something.else', data: { id: 'sale_1' } })),
    );
    expect(chariowWebhookProvider.extractIds(payload).kind).toBe('other');
  });
});
