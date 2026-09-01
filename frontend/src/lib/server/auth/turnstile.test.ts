import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyTurnstileToken, isTurnstileConfigured } from './turnstile';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('verifyTurnstileToken', () => {
  it('is inert (passes without a network call) when TURNSTILE_SECRET_KEY is unset', async () => {
    vi.unstubAllEnvs();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(isTurnstileConfigured()).toBe(false);
    await expect(verifyTurnstileToken(undefined)).resolves.toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a missing token when configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(verifyTurnstileToken('')).resolves.toEqual({ ok: false, reason: 'missing-token' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes when Cloudflare returns success:true', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    await expect(verifyTurnstileToken('tok', '1.2.3.4')).resolves.toEqual({ ok: true });
  });

  it('fails with the joined error codes when Cloudflare rejects', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
      }),
    );
    await expect(verifyTurnstileToken('tok')).resolves.toEqual({
      ok: false,
      reason: 'invalid-input-response',
    });
  });

  it('fails OPEN when Cloudflare is unreachable', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(verifyTurnstileToken('tok')).resolves.toEqual({ ok: true });
  });
});
