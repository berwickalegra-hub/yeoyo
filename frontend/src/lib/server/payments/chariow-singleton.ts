// Lazy-initialized Chariow env + module-level CircuitBreaker — mirrors
// provider-singleton.ts's rationale for Bictorys:
//
//   Reading `process.env.CHARIOW_*` at module top-level would make any
//   route importing this module crash on import if the env is missing.
//   `getChariowEnv()` instead validates lazily on first call and caches
//   the result; the checkout route catches `ChariowProviderUnconfiguredError`
//   and returns a clean 503 PAYMENT_PROVIDER_UNCONFIGURED.
//
//   The CircuitBreaker is shared at module scope by design (in-memory
//   state, single-instance only — see CLAUDE.md). Swap for a Redis-backed
//   variant for multi-pod prod, same as Bictorys's breaker.
//
//   It guards ALL outbound Chariow API calls — both `charge()` (checkout
//   creation) and `getSaleStatus()` (reconciliation reads) — hence the
//   name `chariow.api` rather than `chariow.charge`. One shared breaker is
//   intentional: a Chariow outage is a Chariow outage regardless of which
//   endpoint noticed it first, and tripping open stops the reconcile cron
//   from hammering a dead API just as it stops new checkouts.
import 'server-only';
import type { ChariowEnv } from '@/lib/server/payments/chariow';
import { CircuitBreaker } from '@/lib/server/payments/circuit-breaker';

export class ChariowProviderUnconfiguredError extends Error {
  constructor() {
    super('Chariow not configured (CHARIOW_API_KEY/_WEBHOOK_SECRET missing or empty)');
    this.name = 'ChariowProviderUnconfiguredError';
  }
}

let _env: ChariowEnv | null = null;

export function getChariowEnv(): ChariowEnv {
  if (_env) return _env;

  const url = process.env.CHARIOW_API_URL || 'https://api.chariow.com/v1';
  const key = process.env.CHARIOW_API_KEY ?? '';
  const webhookSecret = process.env.CHARIOW_WEBHOOK_SECRET ?? '';

  if (!key || !webhookSecret) {
    throw new ChariowProviderUnconfiguredError();
  }

  _env = { CHARIOW_API_URL: url, CHARIOW_API_KEY: key, CHARIOW_WEBHOOK_SECRET: webhookSecret };
  return _env;
}

export const chariowBreaker = new CircuitBreaker({
  name: 'chariow.api',
  failureThreshold: 5,
  windowMs: 30_000,
  cooldownMs: 60_000,
});

/** Test-only escape hatch — clears the cached env so `vi.stubEnv` can re-trigger lazy init. @internal */
export function __resetChariowEnvSingleton(): void {
  _env = null;
}
