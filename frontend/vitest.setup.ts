// Source: RESEARCH.md Pattern 20 — sets env BEFORE any module imports auth.ts
// (auth.ts:13–25 throws if JWT_SECRET is missing or < 32 chars).
// Must run as setupFile (not inside a test) because module-level imports
// resolve before any test code.
//
// Per D-27: Vitest setup-files for JWT_SECRET / ENCRYPTION_KEY fixtures lands
// in Phase 1 (auth route tests cannot run without these).
//
// IMPORTANT: must NOT begin with one of the auth.ts placeholder words
// (`change-me|secret|password|test|dev|todo|placeholder`) — auth.ts:21–25
// throws when the secret matches that anchored regex. Prefix with
// `vitest-fixture-` to satisfy length + entropy while bypassing the regex.
process.env.JWT_SECRET ||= 'vitest-fixture-jwt-secret-with-enough-entropy-for-tests';
// Base64 of the literal 32-byte string 'vitest-fixture-32-bytes-exactly!' —
// decodes to EXACTLY 32 bytes as crypto.ts's AES-256-GCM key requires
// (the previous placeholder decoded to 33 bytes and was silently unusable
// with crypto.ts directly; crypto.test.ts worked around it via
// generateKey() — this fixes the seed itself so any test can use it as-is).
process.env.ENCRYPTION_KEY ||= 'dml0ZXN0LWZpeHR1cmUtMzItYnl0ZXMtZXhhY3RseSE=';
process.env.COOKIE_PREFIX ||= 'app';
process.env.NODE_ENV ||= 'test';
// env.ts requires DATABASE_URL unconditionally (no fallback) — most tests
// mock Prisma and never actually connect, but any test that imports
// @/lib/server/env (directly or transitively) needs this parsed at module
// load. Matches the value .github/workflows/ci.yml already exports at the
// job level; never a real connection target in the unit-test run.
process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/db?schema=public';
