// TOTP 2FA + recovery-code helpers for SUPERADMIN login.
//
// The TOTP secret is encrypted at rest with AES-256-GCM (lib/server/crypto)
// using ENCRYPTION_KEY — the same generic secret-encryption key already
// scaffolded in env.ts for exactly this kind of use case. Never store or
// log the decrypted secret or a generated code.
//
// Recovery codes are one-time-use: verifyRecoveryCode returns the list with
// the matched code removed — the caller MUST persist `remaining` back onto
// User.twoFactorRecoveryCodes so it can't be replayed.
import 'server-only';
import bcrypt from 'bcryptjs';
import * as OTPAuth from 'otpauth';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from '@/lib/server/crypto';
import { env } from '@/lib/server/env';

const ISSUER = 'YeOyo Admin';
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 5; // 10 hex chars per code

function requireEncryptionKey(): string {
  if (!env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is not configured — required for admin 2FA secret encryption.');
  }
  return env.ENCRYPTION_KEY;
}

export function generateTotpSecret(email: string): {
  encryptedSecret: string;
  otpauthUri: string;
} {
  const key = requireEncryptionKey();
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
  return {
    encryptedSecret: encrypt(secret.base32, key),
    otpauthUri: totp.toString(),
  };
}

export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  const key = requireEncryptionKey();
  const base32Secret = decrypt(encryptedSecret, key);
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
  // window: 1 tolerates ±30s clock drift between server and authenticator app.
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export function generateRecoveryCodes(): { plain: string[]; hashed: string[] } {
  const plain = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    randomBytes(RECOVERY_CODE_BYTES).toString('hex'),
  );
  const hashed = plain.map((code) => bcrypt.hashSync(code, 10));
  return { plain, hashed };
}

export async function verifyRecoveryCode(
  code: string,
  hashed: string[],
): Promise<{ ok: boolean; remaining: string[] }> {
  for (let i = 0; i < hashed.length; i++) {
    const candidate = hashed[i]!;
    // Sequential await in a small fixed-size loop (≤10 recovery codes) is fine.
    if (await bcrypt.compare(code, candidate)) {
      const remaining = [...hashed.slice(0, i), ...hashed.slice(i + 1)];
      return { ok: true, remaining };
    }
  }
  return { ok: false, remaining: hashed };
}
