import 'server-only';
import { log } from '@/lib/server/observability/log';

// Cloudflare Turnstile — optional anti-bot check on the signup form.
//
// Same env-gated-optional pattern as every other provider in this kit
// (Cloudinary / Resend / Ably / Google / Anthropic): entirely inert without
// TURNSTILE_SECRET_KEY. When the key is absent `verifyTurnstileToken` returns
// `{ ok: true }` without any network call, so signup behaves exactly as it
// did before this file existed.
//
// The client widget is wired in `components/yeoyo/TurnstileWidget.tsx`, gated
// on the public `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SITEVERIFY_TIMEOUT_MS = 5_000;

export function isTurnstileConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

/**
 * Validate a Turnstile token produced by the browser widget.
 *
 * - No `TURNSTILE_SECRET_KEY` configured  → `{ ok: true }` (provider inert).
 * - Configured but token missing/empty    → `{ ok: false }`.
 * - Configured and Cloudflare unreachable → `{ ok: true }` (fail OPEN — a
 *   signup form that hard-blocks because a third party is down is worse than
 *   the bot risk it mitigates; the outage is logged).
 * - Configured and Cloudflare says no     → `{ ok: false }`.
 *
 * Tokens are single-use and expire ~5 min after issue; Cloudflare's endpoint
 * enforces both, so no replay bookkeeping is needed here.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true };

  if (!token) return { ok: false, reason: 'missing-token' };

  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp) form.set('remoteip', remoteIp);

  let data: { success?: boolean; 'error-codes'?: string[] };
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    data = (await res.json()) as typeof data;
  } catch (err) {
    log.warn('turnstile: siteverify unreachable — allowing signup', { err });
    return { ok: true };
  }

  if (data.success === true) return { ok: true };

  const reason = (data['error-codes'] ?? []).join(',') || 'rejected';
  return { ok: false, reason };
}
