/**
 * Chariow payment adapter — hosted checkout for YeOyo's credit-pack
 * purchases (single platform account, not per-creator; see
 * docs/superpowers/specs/2026-08-16-chariow-payment-integration-design.md).
 *
 * Deliberately NOT an implementation of `PaymentProvider` (provider.ts):
 * Chariow charges the price of a pre-configured *product* in its own
 * dashboard (no arbitrary `amount` in the checkout call) and requires a
 * structured `{ national number, ISO2 country }` phone — neither fits the
 * generic marketplace-style `ChargeInput`/`ChargeResult` shape used by
 * `/api/orders` + Bictorys. Kept as a standalone module instead.
 *
 * ASSUMPTION TO VERIFY AGAINST A REAL SANDBOX RESPONSE BEFORE GO-LIVE:
 * `purchase.amount.value` / sale `amount.value` are read here as a decimal
 * dollar amount (e.g. 5.99) and converted to cents via `toSmallestUnit`.
 * Chariow.md does not state the exact numeric format. If a live response
 * turns out to already be in cents, adjust `toSmallestUnit` — it is the
 * single conversion point.
 */
import 'server-only';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import type { WebhookProvider, ParsedIds } from '../webhook/handler';
import type { CreditPack } from '../credits/packs';

const HTTP_TIMEOUT_MS = 30_000;

export interface ChariowEnv {
  CHARIOW_API_URL: string;
  CHARIOW_API_KEY: string;
  CHARIOW_WEBHOOK_SECRET: string;
}

// ───────────────────────────────────────────────────────────────────────
// Status mapping — §3.3 of Chariow.md. ORDER OF TESTS IS LOAD-BEARING:
// "unpaid" contains "paid", so pending must be tested before succeeded.
// ───────────────────────────────────────────────────────────────────────

export type NormalizedChariowStatus = 'succeeded' | 'failed' | 'abandoned' | 'pending';

export function mapChariowStatus(raw: string | undefined): NormalizedChariowStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s.includes('unpaid')) return 'pending';
  if (s.includes('fail') || s.includes('error')) return 'failed';
  if (s.includes('cancel') || s.includes('abandon') || s.includes('refund')) return 'abandoned';
  if (s.includes('settle') || s.includes('complet') || s.includes('paid') || s.includes('success'))
    return 'succeeded';
  return 'pending';
}

// ───────────────────────────────────────────────────────────────────────
// Phone resolution — §3bis of Chariow.md, 4 fallback strategies in order.
// ───────────────────────────────────────────────────────────────────────

export interface ResolvedPhone {
  /** National number, no leading 0, no dial code. */
  number: string;
  /** ISO2 country code. */
  countryCode: string;
}

/** DRC (YeOyo's actual market) first, then the West-African set Chariow.md documents. */
const AFRICAN_DIAL_CODES: Record<string, string> = {
  '243': 'CD',
  '221': 'SN',
  '228': 'TG',
  '229': 'BJ',
  '225': 'CI',
  '226': 'BF',
  '223': 'ML',
  '237': 'CM',
  '241': 'GA',
  '242': 'CG',
};

function splitAfricanDialCode(raw: string): ResolvedPhone | null {
  let digits = raw.replace(/\D/g, '');
  // Strip leading 00 (international prefix in some regions)
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  for (const [dial, iso2] of Object.entries(AFRICAN_DIAL_CODES)) {
    if (digits.startsWith(dial)) {
      const national = digits.slice(dial.length);
      if (national.length >= 6) return { number: national, countryCode: iso2 };
    }
  }
  return null;
}

export function resolveChariowPhone(input: {
  phone?: string;
  phoneCountry?: string;
  phoneLocal?: string;
}): ResolvedPhone | null {
  // 1. phoneCountry + phoneLocal via libphonenumber (strips leading 0, validates).
  if (input.phoneCountry && input.phoneLocal) {
    const parsed = parsePhoneNumberFromString(
      input.phoneLocal,
      input.phoneCountry.toUpperCase() as CountryCode,
    );
    if (parsed?.isValid()) {
      return {
        number: parsed.nationalNumber,
        countryCode: parsed.country ?? input.phoneCountry.toUpperCase(),
      };
    }
  }

  // 2. phone (E.164) via libphonenumber, deducing country.
  if (input.phone) {
    const parsed = parsePhoneNumberFromString(input.phone);
    if (parsed?.isValid() && parsed.country) {
      return { number: parsed.nationalNumber, countryCode: parsed.country };
    }
  }

  // 3. phoneCountry + raw digits, no strict validation (last-resort local repli).
  if (input.phoneCountry && input.phoneLocal) {
    const digits = input.phoneLocal.replace(/\D/g, '');
    if (digits.length >= 6) {
      return { number: digits, countryCode: input.phoneCountry.toUpperCase() };
    }
  }

  // 4. African dial-code table, last resort, from the raw `phone` field.
  if (input.phone) {
    const africa = splitAfricanDialCode(input.phone);
    if (africa) return africa;
  }

  return null;
}

// ───────────────────────────────────────────────────────────────────────
// Product mapping — one Chariow product per credit pack, configured via
// env (packs.ts stays a static, non-provider-coupled catalog).
// ───────────────────────────────────────────────────────────────────────

const PRODUCT_ID_ENV_KEYS: Record<CreditPack['id'], string> = {
  decouverte: 'CHARIOW_PRODUCT_ID_DECOUVERTE',
  serieux: 'CHARIOW_PRODUCT_ID_SERIEUX',
  determine: 'CHARIOW_PRODUCT_ID_DETERMINE',
  engage: 'CHARIOW_PRODUCT_ID_ENGAGE',
};

export function getChariowProductId(packId: CreditPack['id']): string | null {
  return process.env[PRODUCT_ID_ENV_KEYS[packId]] || null;
}

// ───────────────────────────────────────────────────────────────────────
// Amount conversion — see the ASSUMPTION note at the top of this file.
// ───────────────────────────────────────────────────────────────────────

/**
 * Throws rather than falling back to 0 on an unparseable amount. A silent
 * 0 would be written to `Order.amount`, sail through the anti-fraud
 * division-guard, and ultimately send the buyer a "$0.00 payment
 * confirmed" email. Callers (`charge`, `getSaleStatus`) let it surface as
 * the same PROVIDER_ERROR / reconcile-failure path that already handles
 * any other unexpected Chariow response shape.
 */
function toSmallestUnit(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Chariow returned a non-numeric amount: ${String(value)}`);
  }
  return Math.round(n * 100);
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false; status: number; text: string }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, text };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return { ok: true, data };
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────────────────────────────────────────────────────
// Checkout creation — §3.1 of Chariow.md.
// ───────────────────────────────────────────────────────────────────────

export interface ChariowChargeInput {
  productId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: ResolvedPhone;
  redirectUrl: string;
  metadata?: Record<string, unknown>;
}

export interface ChariowChargeResult {
  saleId: string;
  checkoutUrl: string;
  amount: number;
  currency: string;
}

export async function charge(
  env: ChariowEnv,
  input: ChariowChargeInput,
): Promise<ChariowChargeResult> {
  const baseUrl = env.CHARIOW_API_URL.replace(/\/+$/, '');
  const result = await fetchJson(`${baseUrl}/checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CHARIOW_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product_id: input.productId,
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: { number: input.phone.number, country_code: input.phone.countryCode },
      redirect_url: input.redirectUrl,
      ...(input.metadata ? { custom_metadata: input.metadata } : {}),
    }),
  });

  if (!result.ok) {
    throw new Error(
      `Chariow checkout failed: HTTP ${result.status} — ${result.text.slice(0, 200)}`,
    );
  }

  const data = result.data as {
    data?: {
      purchase?: { id?: string; amount?: { value?: unknown; currency?: string } };
      payment?: { checkout_url?: string };
    };
  };
  const saleId = data.data?.purchase?.id;
  const checkoutUrl = data.data?.payment?.checkout_url;
  if (!saleId || !checkoutUrl) {
    throw new Error('Chariow checkout returned no purchase id or checkout_url');
  }

  return {
    saleId,
    checkoutUrl,
    amount: toSmallestUnit(data.data?.purchase?.amount?.value),
    currency: data.data?.purchase?.amount?.currency ?? 'USD',
  };
}

// ───────────────────────────────────────────────────────────────────────
// Sale status pull — §3.2 of Chariow.md. Source of truth for reconciliation.
// ───────────────────────────────────────────────────────────────────────

export interface ChariowSaleStatus {
  status: NormalizedChariowStatus;
  amount: number;
  currency: string;
  settledAt: Date | null;
}

export async function getSaleStatus(env: ChariowEnv, saleId: string): Promise<ChariowSaleStatus> {
  const baseUrl = env.CHARIOW_API_URL.replace(/\/+$/, '');
  const result = await fetchJson(`${baseUrl}/sales/${encodeURIComponent(saleId)}`, {
    headers: { Authorization: `Bearer ${env.CHARIOW_API_KEY}` },
  });

  if (!result.ok) {
    throw new Error(
      `Chariow sale lookup failed: HTTP ${result.status} — ${result.text.slice(0, 200)}`,
    );
  }

  const sale = ((result.data as { data?: Record<string, unknown> }).data ?? result.data) as {
    status?: string;
    amount?: { value?: unknown; currency?: string };
    settled_at?: string;
    paid_at?: string;
    completed_at?: string;
  };

  const settledRaw = sale.settled_at ?? sale.paid_at ?? sale.completed_at ?? null;

  return {
    status: mapChariowStatus(sale.status),
    amount: toSmallestUnit(sale.amount?.value),
    currency: sale.amount?.currency ?? 'USD',
    settledAt: settledRaw ? new Date(settledRaw) : null,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Webhook provider — §7 of Chariow.md. Chariow has NO signature; the
// secret travels in the URL query string (`?secret=`) and is checked by
// the route shim (app/api/webhooks/chariow/route.ts) BEFORE this provider
// is ever invoked. `verifySignature` below always returns valid — that is
// not a bypass, it documents that the gate already happened upstream.
// `extractIds` intentionally reads ONLY the sale id from the body; nothing
// else from the payload is trusted — `onPaid` re-pulls the real status via
// `getSaleStatus` (see reconcile.ts) instead of reading it from here.
// ───────────────────────────────────────────────────────────────────────

export interface ChariowWebhookPayload {
  event?: string;
  event_type?: string;
  data?: { id?: string; sale_id?: string; status?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export const chariowWebhookProvider: WebhookProvider<ChariowWebhookPayload> = {
  name: 'chariow',

  verifySignature() {
    return { valid: true };
  },

  parsePayload(rawBody) {
    return JSON.parse(rawBody.toString('utf8')) as ChariowWebhookPayload;
  },

  extractIds(payload): ParsedIds {
    const data = payload.data ?? {};
    const externalId = String(data.id ?? data.sale_id ?? '');
    const eventType = String(payload.event ?? payload.event_type ?? 'unknown');
    const evt = eventType.toLowerCase();
    const kind: ParsedIds['kind'] =
      evt.includes('successful') || evt.includes('settled') || evt.includes('completed')
        ? 'paid'
        : evt.includes('failed')
          ? 'failed'
          : evt.includes('cancel') || evt.includes('abandon') || evt.includes('refund')
            ? 'refunded'
            : 'other';
    return { externalId, eventType, kind };
  },
};
