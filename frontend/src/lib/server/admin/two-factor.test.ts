import { describe, it, expect } from 'vitest';
import { decrypt, generateKey } from '@/lib/server/crypto';
import { env } from '@/lib/server/env';

// The ENCRYPTION_KEY placeholder seeded by vitest.setup.ts is a fixed-length
// *string* fixture (for JWT_SECRET-style length checks), not necessarily a
// base64 string that decodes to the 32 raw bytes lib/server/crypto (PROTECTED)
// enforces — see crypto.test.ts, which sidesteps the same placeholder for the
// same reason via `generateKey()`. Do the same here so the module under test
// (which reads env.ENCRYPTION_KEY internally) gets a key crypto.ts accepts.
env.ENCRYPTION_KEY = generateKey();

import {
  generateTotpSecret,
  verifyTotpCode,
  generateRecoveryCodes,
  verifyRecoveryCode,
} from './two-factor';
import * as OTPAuth from 'otpauth';

describe('two-factor helpers', () => {
  it('generateTotpSecret returns an encrypted secret and a valid otpauth:// URI', () => {
    const { encryptedSecret, otpauthUri } = generateTotpSecret('superadmin@test.local');
    expect(encryptedSecret).toContain(':'); // iv:tag:data format from lib/server/crypto
    expect(otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(otpauthUri).toContain('superadmin%40test.local');
  });

  it('verifyTotpCode accepts the current code for the generated secret', () => {
    const { encryptedSecret } = generateTotpSecret('superadmin@test.local');
    // Re-derive the same TOTP instance the helper used internally by
    // decrypting via the module's own round trip: generate a code the same
    // way generateTotpSecret's caller would, using the *decrypted* secret.
    // We can't access the plaintext secret from outside the module, so
    // instead assert the round trip through the module's own two functions.
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(decryptForTest(encryptedSecret)),
    });
    const code = totp.generate();
    expect(verifyTotpCode(encryptedSecret, code)).toBe(true);
  });

  it('verifyTotpCode rejects a wrong code', () => {
    const { encryptedSecret } = generateTotpSecret('superadmin@test.local');
    expect(verifyTotpCode(encryptedSecret, '000000')).toBe(false);
  });

  it('generateRecoveryCodes returns 10 plain codes and 10 bcrypt hashes', () => {
    const { plain, hashed } = generateRecoveryCodes();
    expect(plain).toHaveLength(10);
    expect(hashed).toHaveLength(10);
    expect(new Set(plain).size).toBe(10); // no duplicates
    expect(hashed[0]).toMatch(/^\$2[aby]\$/);
  });

  it('verifyRecoveryCode consumes a matching code and removes it from the list', async () => {
    const { plain, hashed } = generateRecoveryCodes();
    const { ok, remaining } = await verifyRecoveryCode(plain[0]!, hashed);
    expect(ok).toBe(true);
    expect(remaining).toHaveLength(9);
  });

  it('verifyRecoveryCode rejects a code not in the list', async () => {
    const { hashed } = generateRecoveryCodes();
    const { ok, remaining } = await verifyRecoveryCode('not-a-real-code', hashed);
    expect(ok).toBe(false);
    expect(remaining).toHaveLength(hashed.length);
  });
});

// Test-only helper: decrypts using the same env key the module uses, purely
// to construct an independent TOTP instance for the "accepts current code"
// assertion above. Not exported by the module itself.
function decryptForTest(encryptedSecret: string): string {
  return decrypt(encryptedSecret, env.ENCRYPTION_KEY!);
}
