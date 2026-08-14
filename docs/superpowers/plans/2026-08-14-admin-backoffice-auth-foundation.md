# Admin Back-Office — Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a MODERATOR role, a dedicated `/admin/login` (with TOTP 2FA for SUPERADMIN), and email-based admin invitations to YeOyo's existing Prisma/Neon admin back-office — sub-project 1 of 8 in the full back-office build.

**Architecture:** Extend the existing `USER < ADMIN < SUPERADMIN` role hierarchy with `MODERATOR`, add three new Prisma models (`AdminInvite`, `AdminTwoFactorChallenge`, plus 2FA columns on `User`), and build new API routes under `frontend/src/app/api/admin/` that compose the project's existing auth primitives (`hashPassword`, `verifyPassword`, `setAuthCookies`, lockout, per-email rate limiting) rather than introducing a parallel auth stack. Two existing protected files require small, additive edits (flagged per-task with an explicit confirmation step).

**Tech Stack:** Next.js 16 App Router (Node runtime), Prisma 5 / Neon Postgres, Zod, bcryptjs, `otpauth` (new dep, TOTP), `qrcode` (new dep, server-rendered QR as data URI), Resend (via existing outbox → email-queue-drain cron), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-admin-backoffice-auth-foundation-design.md`

## Global Constraints

- Every new Route Handler MUST `export const runtime = 'nodejs'`.
- Every mutating route MUST call `verifyCsrf(req)` first (except pre-session routes: `/api/admin/login`, `/api/admin/2fa/verify`, `/api/admin/invites/accept` — no session cookie exists yet to CSRF-protect, matching the existing `/api/auth/login` carve-out).
- Every admin mutation MUST call `logAdminAction`.
- Role checks use `requireAdmin(minRole)` / `requireSuperadmin()` — never a raw string comparison.
- Do NOT modify `frontend/src/lib/server/auth.ts`, `frontend/src/lib/server/crypto.ts`, `frontend/src/lib/server/middleware/index.ts`, or `frontend/src/lib/server/rate-limit-store.ts` — only import their exports.
- `frontend/src/lib/server/middleware/require-admin.ts` and `frontend/src/lib/server/outbox/dispatcher.ts` ARE on the protected list but each need one small additive change in this plan — Tasks 2 and 8 each start with a mandatory "confirm with the user before editing" step. Do not skip it even though the plan already describes the change.
- New DB columns/models are additive only — no renaming or removal of existing fields.
- French UI copy (the rest of the app is French — see existing `/admin` pages).
- Before considering the plan done, run `pnpm format && pnpm lint && pnpm typecheck && pnpm test` from repo root — all must pass (Task 14).

---

### Task 1: Schema — MODERATOR role, 2FA columns, AdminInvite, AdminTwoFactorChallenge

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create: migration via `pnpm db:migrate:dev` (generates `frontend/prisma/migrations/<timestamp>_admin_auth_foundation/migration.sql`)
- Modify: `frontend/src/test-utils/admin-fixtures.ts`
- Test: `frontend/src/lib/server/admin/schema.test.ts` (new — smoke-tests the Prisma client picks up the new fields/models)

**Interfaces:**
- Produces: `User.role` now documented as `'USER' | 'MODERATOR' | 'ADMIN' | 'SUPERADMIN'` (still `String` at the DB level — no enum). `User.twoFactorSecret: string | null`, `User.twoFactorEnabled: boolean`, `User.twoFactorRecoveryCodes: Prisma.JsonValue | null` (array of bcrypt hashes). New models `AdminInvite` and `AdminTwoFactorChallenge` (fields below) — later tasks read/write these via `prisma.adminInvite.*` / `prisma.adminTwoFactorChallenge.*`.

- [ ] **Step 1: Edit `frontend/prisma/schema.prisma` — extend `User`**

Find the `role` field (currently `role String @default("USER") // USER | ADMIN | SUPERADMIN`) and update the comment, then add the three new columns right after `status`:

```prisma
  // App-wide role. USER is the default; MODERATOR unlocks a scoped subset
  // of /admin (verification queue, reports, support); ADMIN unlocks the
  // full back-office; SUPERADMIN can promote/demote other admins and
  // manage 2FA/invites. Bootstrap an initial SUPERADMIN via
  // `pnpm db:make-superadmin <email>` (see scripts).
  role              String    @default("USER") // USER | MODERATOR | ADMIN | SUPERADMIN
  // Account status. ACTIVE = login + refresh allowed; SUSPENDED = both
  // refused with 403 ACCOUNT_SUSPENDED. Mutated via /api/admin/users/[id]/status
  // (ADMIN can suspend; only SUPERADMIN can restore).
  status            String    @default("ACTIVE") // ACTIVE | SUSPENDED
  // TOTP 2FA — SUPERADMIN only, opt-in. Secret is AES-256-GCM encrypted at
  // rest (see lib/server/admin/two-factor.ts) using ENCRYPTION_KEY, never
  // stored or logged in plaintext. Recovery codes are bcrypt hashes, each
  // consumable once (removed from the array on use).
  twoFactorSecret         String?
  twoFactorEnabled        Boolean   @default(false)
  twoFactorRecoveryCodes  Json?
```

- [ ] **Step 2: Add `AdminInvite` and `AdminTwoFactorChallenge` models**

Append after the `AdminAction` model block:

```prisma
// ───────────────────────────────────────────────────────────────────────
// Admin invitations — SUPERADMIN invites a new MODERATOR/ADMIN/SUPERADMIN
// by email. `tokenHash` is a SHA-256 hex digest of the raw token mailed to
// the invitee (the raw token is never stored — same threat model as a
// password, since possessing it grants an admin role on acceptance).
// ───────────────────────────────────────────────────────────────────────
model AdminInvite {
  id           String    @id @default(cuid())
  email        String
  role         String // MODERATOR | ADMIN | SUPERADMIN
  tokenHash    String    @unique
  invitedById  String
  invitedBy    User      @relation(fields: [invitedById], references: [id], onDelete: Restrict)
  expiresAt    DateTime
  acceptedAt   DateTime?
  revokedAt    DateTime?
  createdAt    DateTime  @default(now())

  @@index([email])
  @@index([tokenHash])
}

// ───────────────────────────────────────────────────────────────────────
// Bridges password-verified → TOTP-verified during SUPERADMIN login. A row
// exists only while the second factor is pending; consumed (deleted) on
// successful verify, or left to expire (short TTL) otherwise.
// ───────────────────────────────────────────────────────────────────────
model AdminTwoFactorChallenge {
  id         String    @id @default(cuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime
  attempts   Int       @default(0)
  consumedAt DateTime?
  createdAt  DateTime  @default(now())

  @@index([userId])
}
```

- [ ] **Step 3: Add the two back-relations to `User`**

In the `User` model's relation block, next to `adminActions AdminAction[]`, add:

```prisma
  adminActions        AdminAction[]
  invitesSent         AdminInvite[]
  twoFactorChallenges AdminTwoFactorChallenge[]
```

- [ ] **Step 4: Generate and apply the migration**

Run: `pnpm db:migrate:dev --name admin_auth_foundation`
Expected: creates `frontend/prisma/migrations/<timestamp>_admin_auth_foundation/migration.sql` adding the 3 columns + 2 tables, applies cleanly against the dev database, and regenerates the Prisma client (`@prisma/client` types now include `twoFactorSecret`, `AdminInvite`, `AdminTwoFactorChallenge`).

- [ ] **Step 5: Update `frontend/src/test-utils/admin-fixtures.ts` for the new required fields**

The generated `User` type now requires `twoFactorSecret`, `twoFactorEnabled`, `twoFactorRecoveryCodes` on every row, or `buildUser`'s `as User` cast will fail to compile. Update the file:

```typescript
interface UserOverrides {
  id?: string;
  email?: string;
  role?: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';
  status?: 'ACTIVE' | 'SUSPENDED';
  passwordHash?: string | null;
  emailVerifiedAt?: Date | null;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string | null;
}

function buildUser(overrides: UserOverrides = {}): User {
  return {
    id: overrides.id ?? `user_${Math.random().toString(36).slice(2, 10)}`,
    email: overrides.email ?? `user-${Date.now()}@test.local`,
    passwordHash:
      overrides.passwordHash ?? '$2b$12$fakehashfakehashfakehashfakehashfakehashfakeHASHE',
    emailVerifiedAt: overrides.emailVerifiedAt ?? FROZEN_NOW,
    tokenVersion: 0,
    withdrawalPinHash: null,
    name: null,
    avatarUrl: null,
    role: overrides.role ?? 'USER',
    status: overrides.status ?? 'ACTIVE',
    twoFactorSecret: overrides.twoFactorSecret ?? null,
    twoFactorEnabled: overrides.twoFactorEnabled ?? false,
    twoFactorRecoveryCodes: null,
    createdAt: FROZEN_NOW,
    updatedAt: FROZEN_NOW,
  } as User;
}
```

Also add a `seedModerator` factory next to `seedAdmin`/`seedSuperadmin`:

```typescript
export function seedModerator(overrides: UserOverrides = {}): User {
  return buildUser({
    id: overrides.id ?? 'moderator_seed_1',
    email: overrides.email ?? 'moderator@test.local',
    role: 'MODERATOR',
    status: overrides.status ?? 'ACTIVE',
    ...overrides,
  });
}
```

And a factory for the new models, near the bottom of the file (after `seedWithdrawal`):

```typescript
interface AdminInviteOverrides {
  id?: string;
  email?: string;
  role?: 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';
  tokenHash?: string;
  invitedById?: string;
  expiresAt?: Date;
  acceptedAt?: Date | null;
  revokedAt?: Date | null;
}

export function seedAdminInvite(overrides: AdminInviteOverrides = {}) {
  return {
    id: overrides.id ?? `invite_${Math.random().toString(36).slice(2, 10)}`,
    email: overrides.email ?? 'invitee@test.local',
    role: overrides.role ?? 'MODERATOR',
    tokenHash: overrides.tokenHash ?? 'a'.repeat(64),
    invitedById: overrides.invitedById ?? 'superadmin_seed_1',
    expiresAt: overrides.expiresAt ?? new Date(FROZEN_NOW.getTime() + 48 * 60 * 60 * 1000),
    acceptedAt: overrides.acceptedAt ?? null,
    revokedAt: overrides.revokedAt ?? null,
    createdAt: FROZEN_NOW,
  };
}
```

- [ ] **Step 6: Write and run the schema smoke test**

Create `frontend/src/lib/server/admin/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { seedModerator, seedAdminInvite } from '@/test-utils/admin-fixtures';

describe('admin auth foundation schema fixtures', () => {
  it('seedModerator returns role MODERATOR with 2FA fields defaulted', () => {
    const user = seedModerator();
    expect(user.role).toBe('MODERATOR');
    expect(user.twoFactorEnabled).toBe(false);
    expect(user.twoFactorSecret).toBeNull();
  });

  it('seedAdminInvite returns a pending, unexpired invite', () => {
    const invite = seedAdminInvite();
    expect(invite.acceptedAt).toBeNull();
    expect(invite.revokedAt).toBeNull();
    expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now() - 1000 * 60 * 60 * 24 * 365);
  });
});
```

Run: `pnpm --filter frontend exec vitest run src/lib/server/admin/schema.test.ts src/test-utils/admin-fixtures.ts`
Expected: PASS (2 tests). If TypeScript errors surface about missing fields on other fixtures in the same file (e.g. `seedActiveUserWithPin`'s `buildUser(overrides)` call), they're already covered since it calls the same `buildUser` you just updated — no further edits needed there.

- [ ] **Step 7: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations frontend/src/test-utils/admin-fixtures.ts frontend/src/lib/server/admin/schema.test.ts
git commit -m "feat(admin): add MODERATOR role, 2FA columns, AdminInvite + AdminTwoFactorChallenge models"
```

---

### Task 2: Protected file — add MODERATOR to the role hierarchy

**Files:**
- Modify: `frontend/src/lib/server/middleware/require-admin.ts` (PROTECTED — see step 1)
- Test: `frontend/src/lib/server/middleware/require-admin.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `AdminRole` now includes `'MODERATOR'`; `roleRank('MODERATOR') === 1`, `roleRank('ADMIN') === 2`, `roleRank('SUPERADMIN') === 3` (both shifted up by one from today's `1`/`2`). Every later task's `requireAdmin('MODERATOR' | 'ADMIN' | 'SUPERADMIN')` call relies on this.

- [ ] **Step 1: Stop and confirm with the user before editing**

This file is on CLAUDE.md's protected list ("role precedence + Context shape consumed by every route"). Before touching it, post this to the user and wait for an explicit go-ahead:

> "I'm about to modify `frontend/src/lib/server/middleware/require-admin.ts` (protected file) to add `MODERATOR` to the `AdminRole` type and shift `ROLE_RANK` (`USER:0, MODERATOR:1, ADMIN:2, SUPERADMIN:3`, up from today's `USER:0, ADMIN:1, SUPERADMIN:2`). This is additive and only changes relative comparisons via `roleRank()` — confirm before I proceed?"

Do not proceed to Step 2 without a yes.

- [ ] **Step 2: Grep for any hardcoded rank literals before shifting**

Run: `pnpm --filter frontend exec grep -rn "roleRank\|ROLE_RANK" src --include="*.ts" --include="*.tsx"`
Expected: every hit either imports `roleRank`/`ROLE_RANK` from `require-admin.ts` and calls `roleRank(x) < roleRank(y)` (relative comparison, safe to shift), or is inside `require-admin.ts` itself. If any file compares a role to a bare number (e.g. `roleRank(x) < 2`), stop and report it — the shift would silently break that check. (As of this plan's writing, no such literal exists — `middleware/index.ts` and every route use `requireAdmin('ADMIN')`/`requireAdmin('SUPERADMIN')` by name, never by number.)

- [ ] **Step 3: Edit the file**

Replace the full contents of `frontend/src/lib/server/middleware/require-admin.ts`:

```typescript
/**
 * App-wide role hierarchy used by the admin back-office.
 * Precedence: SUPERADMIN > ADMIN > MODERATOR > USER.
 *
 * MODERATOR is scoped to moderation + support surfaces (verification
 * queue, reports) — routes gate it explicitly via `requireAdmin('MODERATOR')`;
 * it does NOT inherit general ADMIN access to users/subscriptions/roles.
 *
 * The actual gate logic now lives in `./index.ts` (`requireAdmin`,
 * `requireSuperadmin`) — this file only exports the role type + rank
 * function so audit/route code can do role math without pulling in the
 * full middleware module.
 */
import 'server-only';

export type AdminRole = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';

const ROLE_RANK: Record<AdminRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPERADMIN: 3 };

export function roleRank(role: AdminRole): number {
  return ROLE_RANK[role] ?? 0;
}
```

- [ ] **Step 4: Write the test**

Create `frontend/src/lib/server/middleware/require-admin.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { roleRank } from './require-admin';

describe('roleRank', () => {
  it('orders USER < MODERATOR < ADMIN < SUPERADMIN', () => {
    expect(roleRank('USER')).toBeLessThan(roleRank('MODERATOR'));
    expect(roleRank('MODERATOR')).toBeLessThan(roleRank('ADMIN'));
    expect(roleRank('ADMIN')).toBeLessThan(roleRank('SUPERADMIN'));
  });

  it('MODERATOR passes a MODERATOR-minimum gate but not an ADMIN-minimum gate', () => {
    expect(roleRank('MODERATOR') >= roleRank('MODERATOR')).toBe(true);
    expect(roleRank('MODERATOR') >= roleRank('ADMIN')).toBe(false);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `pnpm --filter frontend exec vitest run src/lib/server/middleware/require-admin.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full existing admin test suite to confirm the rank shift didn't break anything**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin`
Expected: all existing admin route tests still PASS (they compare roles by name via `requireAdmin('ADMIN')` etc., not by numeric literal, so the shift is transparent to them).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/server/middleware/require-admin.ts frontend/src/lib/server/middleware/require-admin.test.ts
git commit -m "feat(admin): add MODERATOR to the admin role hierarchy"
```

---

### Task 3: Wire MODERATOR access to verification-queue + reports; update `/api/admin/me`

**Files:**
- Modify: `frontend/src/app/api/admin/me/route.ts`
- Modify: `frontend/src/app/api/admin/verification-queue/route.ts`
- Modify: `frontend/src/app/api/admin/verification-queue/[id]/process/route.ts`
- Modify: `frontend/src/app/api/admin/reports/route.ts`
- Modify: `frontend/src/app/api/admin/reports/[id]/resolve/route.ts`
- Test: update corresponding `*.test.ts` files for the 4 routes above (add a MODERATOR-allowed case) and `frontend/src/app/api/admin/me/route.test.ts` (if it doesn't exist, create it)

**Interfaces:**
- Consumes: `roleRank`/`AdminRole` from Task 2.
- Produces: `CAPABILITIES_BY_ROLE` gains a `MODERATOR` entry `['verification-queue:read', 'verification-queue:process', 'reports:read', 'reports:resolve']` — Task 11's frontend reads this to decide what to render.

- [ ] **Step 1: Lower the 4 route gates from `'ADMIN'` to `'MODERATOR'`**

In each of `verification-queue/route.ts`, `verification-queue/[id]/process/route.ts`, `reports/route.ts`, `reports/[id]/resolve/route.ts`, change:

```typescript
const auth = await requireAdmin('ADMIN');
```

to:

```typescript
const auth = await requireAdmin('MODERATOR');
```

Leave everything else in those files untouched (rate limiting, Zod parsing, business logic, audit logging all stay as-is — MODERATOR and ADMIN both flow through the same handler body).

- [ ] **Step 2: Add the MODERATOR capability list to `/api/admin/me`**

In `frontend/src/app/api/admin/me/route.ts`, change the gate and the capability map:

```typescript
const CAPABILITIES_BY_ROLE: Record<'MODERATOR' | 'ADMIN' | 'SUPERADMIN', readonly string[]> = {
  MODERATOR: [
    'verification-queue:read',
    'verification-queue:process',
    'reports:read',
    'reports:resolve',
  ],
  ADMIN: [
    'users:read',
    'users:status:suspend',
    'orders:read',
    'withdrawals:read',
    'audit-log:read',
    'outbox:read',
    'email-queue:read',
    'rate-limits:read',
  ],
  SUPERADMIN: [
    'users:read',
    'users:role',
    'users:status:suspend',
    'users:status:restore',
    'orders:read',
    'withdrawals:read',
    'withdrawals:cancel',
    'audit-log:read',
    'outbox:read',
    'email-queue:read',
    'rate-limits:read',
    'admin:invite',
    'admin:revoke',
  ],
} as const;
```

And update the `GET` handler's gate + narrowing cast:

```typescript
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('MODERATOR');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const role = auth.admin.role as 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';

    return NextResponse.json(
      {
        admin: {
          id: auth.admin.id,
          email: auth.admin.email,
          role,
        },
        can: CAPABILITIES_BY_ROLE[role],
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

(Keep the rest of the file — imports, doc comment header — as-is; only the constant and the two lines inside `GET` change. Also update the doc comment's "CAPABILITY LIST CONTRACT" block to mention the new `MODERATOR` row alongside the existing ADMIN=8/SUPERADMIN=11 counts, now `MODERATOR=4`, `SUPERADMIN=13`.)

- [ ] **Step 3: Update the 4 route tests to add a MODERATOR-allowed case**

For each of the 4 modified routes' test files, add one test (pattern from `frontend/src/app/api/admin/users/[id]/route.test.ts` — mock `requireAdmin` to resolve, assert 200 not 403). Example for `frontend/src/app/api/admin/reports/route.test.ts` (add alongside existing tests):

```typescript
import { seedModerator } from '@/test-utils/admin-fixtures';

it('GET allows MODERATOR (not just ADMIN)', async () => {
  const moderator = seedModerator();
  mockRequireAdmin.mockResolvedValueOnce({
    user: { sub: moderator.id, email: moderator.email },
    admin: { id: moderator.id, email: moderator.email, role: 'MODERATOR' as const },
  });
  prismaMock.report.findMany.mockResolvedValueOnce([]);
  const res = await GET(makeGet('http://test/api/admin/reports'));
  expect(res.status).toBe(200);
});
```

Apply the same pattern to the other 3 routes, using their actual Prisma call: `reports/route.ts` and `reports/[id]/resolve/route.ts` mock `prismaMock.report.findMany` / `prismaMock.report.update` respectively; `verification-queue/route.ts` and `verification-queue/[id]/process/route.ts` mock `prismaMock.profile.findMany` / `prismaMock.profile.update` respectively (both list routes also call `.count` — mock that too, e.g. `prismaMock.report.count.mockResolvedValueOnce(0)` / `prismaMock.profile.count.mockResolvedValueOnce(0)`). Match each file's existing tests for the exact response-shape assertions.

- [ ] **Step 4: Create `frontend/src/app/api/admin/me/route.test.ts`**

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';
import { seedModerator, seedAdmin, seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/me', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
});

describe('/api/admin/me', () => {
  it('MODERATOR sees the 4-item capability list', async () => {
    const moderator = seedModerator();
    mockRequireAdmin.mockResolvedValueOnce({
      user: { sub: moderator.id, email: moderator.email },
      admin: { id: moderator.id, email: moderator.email, role: 'MODERATOR' as const },
    });
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { can: string[] };
    expect(body.can).toEqual([
      'verification-queue:read',
      'verification-queue:process',
      'reports:read',
      'reports:resolve',
    ]);
  });

  it('ADMIN sees the 8-item capability list (unchanged)', async () => {
    const admin = seedAdmin();
    mockRequireAdmin.mockResolvedValueOnce({
      user: { sub: admin.id, email: admin.email },
      admin: { id: admin.id, email: admin.email, role: 'ADMIN' as const },
    });
    const res = await GET(makeGet());
    const body = (await res.json()) as { can: string[] };
    expect(body.can).toHaveLength(8);
  });

  it('SUPERADMIN sees the 13-item capability list (11 + admin:invite + admin:revoke)', async () => {
    const superadmin = seedSuperadmin();
    mockRequireAdmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    const res = await GET(makeGet());
    const body = (await res.json()) as { can: string[] };
    expect(body.can).toHaveLength(13);
  });

  it('propagates the 403 from requireAdmin (below MODERATOR)', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 5: Run the updated tests**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/me src/app/api/admin/verification-queue src/app/api/admin/reports`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/admin/me frontend/src/app/api/admin/verification-queue frontend/src/app/api/admin/reports
git commit -m "feat(admin): grant MODERATOR access to verification-queue + reports"
```

---

### Task 4: TOTP + recovery-code helper module

**Files:**
- Create: `frontend/src/lib/server/admin/two-factor.ts`
- Test: `frontend/src/lib/server/admin/two-factor.test.ts`

**Interfaces:**
- Consumes: `encrypt`/`decrypt` from `@/lib/server/crypto`, `env.ENCRYPTION_KEY` from `@/lib/server/env`, `bcrypt` from `bcryptjs`, `otpauth`.
- Produces: `generateTotpSecret(email: string): { encryptedSecret: string; otpauthUri: string }`, `verifyTotpCode(encryptedSecret: string, code: string): boolean`, `generateRecoveryCodes(): { plain: string[]; hashed: string[] }`, `verifyRecoveryCode(code: string, hashed: string[]): Promise<{ ok: boolean; remaining: string[] }>` — consumed by Tasks 5–7.

- [ ] **Step 1: Add the `otpauth` and `qrcode` dependencies**

Run: `pnpm --filter frontend add otpauth qrcode`
Run: `pnpm --filter frontend add -D @types/qrcode`
Expected: `frontend/package.json` gains `otpauth` and `qrcode` under `dependencies`, `@types/qrcode` under `devDependencies`; lockfile updates.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/lib/server/admin/two-factor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
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
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(decryptForTest(encryptedSecret)) });
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
import { decrypt } from '@/lib/server/crypto';
import { env } from '@/lib/server/env';
function decryptForTest(encryptedSecret: string): string {
  return decrypt(encryptedSecret, env.ENCRYPTION_KEY!);
}
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/admin/two-factor.test.ts`
Expected: FAIL — `Cannot find module './two-factor'`.

- [ ] **Step 4: Implement the module**

Create `frontend/src/lib/server/admin/two-factor.ts`:

```typescript
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
    throw new Error(
      'ENCRYPTION_KEY is not configured — required for admin 2FA secret encryption.',
    );
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
    // eslint-disable-next-line no-await-in-loop -- small fixed array (≤10), sequential compare is fine
    if (await bcrypt.compare(code, candidate)) {
      const remaining = [...hashed.slice(0, i), ...hashed.slice(i + 1)];
      return { ok: true, remaining };
    }
  }
  return { ok: false, remaining: hashed };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/admin/two-factor.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/lib/server/admin/two-factor.ts frontend/src/lib/server/admin/two-factor.test.ts
git commit -m "feat(admin): add TOTP + recovery-code helper module"
```

---

### Task 5: `POST /api/admin/login`

**Files:**
- Create: `frontend/src/app/api/admin/login/route.ts`
- Test: `frontend/src/app/api/admin/login/route.test.ts`

**Interfaces:**
- Consumes: `verifyPassword`, `createAccessToken`, `createRefreshToken`, `setAuthCookies`, `setCsrfCookie` from `@/lib/server/auth`; `isLockedOut`/`recordFailure`/`recordSuccess` from `@/lib/server/auth/lockout`; `dummyBcryptCompare` from `@/lib/server/auth/dummy-bcrypt`; `createEmailLimiter` from `@/lib/server/middleware/rate-limit-by-email`; `roleRank` from `@/lib/server/middleware/require-admin`.
- Produces: on success without 2FA, the same 3 cookies `/api/auth/login` sets, plus `{ ok: true, admin: { id, email, role } }`. When SUPERADMIN + `twoFactorEnabled`, creates an `AdminTwoFactorChallenge` row and responds `{ twoFactorRequired: true, challengeId }` with NO cookies — Task 6 consumes `challengeId`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/admin/login/route.test.ts`:

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/auth/lockout', () => ({
  isLockedOut: vi.fn().mockResolvedValue(false),
  recordFailure: vi.fn().mockResolvedValue({ count: 1, locked: false }),
  recordSuccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/redis', () => ({ getRedis: () => null }));

import { POST } from './route';
import { seedAdmin, seedSuperadmin } from '@/test-utils/admin-fixtures';
import bcrypt from 'bcryptjs';

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/login', () => {
  it('rejects a non-admin USER with generic INVALID_CREDENTIALS (no role leak)', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 12);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'user@test.local',
      passwordHash,
      role: 'USER',
      status: 'ACTIVE',
      twoFactorEnabled: false,
      twoFactorSecret: null,
      tokenVersion: 0,
    } as never);

    const res = await POST(makePost({ email: 'user@test.local', password: 'correct-horse' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_CREDENTIALS');
  });

  it('issues cookies immediately for ADMIN with 2FA not applicable', async () => {
    const admin = seedAdmin({ passwordHash: await bcrypt.hash('correct-horse', 12) });
    prismaMock.user.findUnique.mockResolvedValueOnce(admin as never);

    const res = await POST(makePost({ email: admin.email, password: 'correct-horse' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; admin: { role: string } };
    expect(body.ok).toBe(true);
    expect(body.admin.role).toBe('ADMIN');
    expect(res.cookies.get('app-token')).toBeDefined();
  });

  it('returns twoFactorRequired for SUPERADMIN with 2FA enabled, without cookies', async () => {
    const superadmin = seedSuperadmin({
      passwordHash: await bcrypt.hash('correct-horse', 12),
      twoFactorEnabled: true,
      twoFactorSecret: 'iv:tag:data',
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(superadmin as never);
    prismaMock.adminTwoFactorChallenge.create.mockResolvedValueOnce({
      id: 'challenge_1',
      userId: superadmin.id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
    } as never);

    const res = await POST(makePost({ email: superadmin.email, password: 'correct-horse' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { twoFactorRequired: boolean; challengeId: string };
    expect(body.twoFactorRequired).toBe(true);
    expect(body.challengeId).toBe('challenge_1');
    expect(res.cookies.get('app-token')).toBeUndefined();
  });

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    const admin = seedAdmin({ passwordHash: await bcrypt.hash('correct-horse', 12) });
    prismaMock.user.findUnique.mockResolvedValueOnce(admin as never);

    const res = await POST(makePost({ email: admin.email, password: 'wrong-password' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_CREDENTIALS');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/login/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/admin/login/route.ts`:

```typescript
// POST /api/admin/login — dedicated admin login, separate from
// /api/auth/login. Same credential-check sequence (D-24 enumeration
// resistance: dummy bcrypt on no-user, generic INVALID_CREDENTIALS on both
// "no such user" and "not an admin"), plus a role floor and a 2FA branch
// for SUPERADMIN accounts with twoFactorEnabled.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
  setCsrfCookie,
  verifyPassword,
} from '@/lib/server/auth';
import { isLockedOut, recordFailure, recordSuccess } from '@/lib/server/auth/lockout';
import { dummyBcryptCompare } from '@/lib/server/auth/dummy-bcrypt';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { roleRank, type AdminRole } from '@/lib/server/middleware/require-admin';
import { getRedis } from '@/lib/server/redis';
import { prisma } from '@/lib/server/prisma';
import { zEmail } from '@/lib/server/zod-helpers';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const LoginSchema = z.object({
  email: zEmail,
  password: z.string().min(1),
});

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const redis = getRedis() ?? undefined;
const limiter = createEmailLimiter(
  { ...(redis ? { redis } : {}) },
  {
    bucket: 'admin:login',
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX ?? 10),
    code: 'TOO_MANY_LOGIN_ATTEMPTS',
    message: 'Too many login attempts. Try again later.',
  },
);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid JSON body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { email, password } = parsed.data;

    const rl = await limiter.check(req, email);
    if (rl) {
      rl.headers.set('x-request-id', ctx.requestId);
      return rl;
    }

    if (await isLockedOut(email)) {
      log.warn('admin login blocked by lockout', { email });
      return NextResponse.json(
        { error: 'LOCKED_OUT', message: 'Account temporarily locked.' },
        { status: 423, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        status: true,
        tokenVersion: true,
        twoFactorEnabled: true,
      },
    });

    const role = (user?.role as AdminRole | undefined) ?? 'USER';
    const isAdminEligible = user && roleRank(role) >= roleRank('MODERATOR');

    // No-user OR not-admin-enough: same generic error + dummy compare, so
    // an attacker can't distinguish "no account" from "account exists but
    // isn't an admin" (D-24-style enumeration resistance).
    if (!user || !user.passwordHash || !isAdminEligible) {
      await dummyBcryptCompare(password);
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      const r = await recordFailure(email);
      if (r.locked) {
        return NextResponse.json(
          { error: 'LOCKED_OUT', message: 'Account temporarily locked.' },
          { status: 423, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (user.status === 'SUSPENDED') {
      await recordSuccess(email);
      return NextResponse.json(
        { error: 'ACCOUNT_SUSPENDED', message: 'This account has been suspended.' },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await recordSuccess(email);

    // SUPERADMIN + 2FA enabled: hold cookies, hand back a challenge instead.
    if (role === 'SUPERADMIN' && user.twoFactorEnabled) {
      const challenge = await prisma.adminTwoFactorChallenge.create({
        data: {
          userId: user.id,
          expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
        },
      });
      return NextResponse.json(
        { twoFactorRequired: true, challengeId: challenge.id },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const accessToken = await createAccessToken({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = await createRefreshToken(user.id, user.tokenVersion);
    await setAuthCookies(accessToken, refreshToken);
    await setCsrfCookie();

    return NextResponse.json(
      { ok: true, admin: { id: user.id, email: user.email, role } },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/login/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/admin/login
git commit -m "feat(admin): add POST /api/admin/login with role-floor + 2FA branch"
```

---

### Task 6: `POST /api/admin/2fa/verify`

**Files:**
- Create: `frontend/src/app/api/admin/2fa/verify/route.ts`
- Test: `frontend/src/app/api/admin/2fa/verify/route.test.ts`

**Interfaces:**
- Consumes: `verifyTotpCode`, `verifyRecoveryCode` from Task 4's `two-factor.ts`; `createAccessToken`/`createRefreshToken`/`setAuthCookies`/`setCsrfCookie` from `@/lib/server/auth`.
- Produces: on success, the same cookie set as `/api/admin/login`'s non-2FA branch, plus `{ ok: true, admin: {...} }`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/admin/2fa/verify/route.test.ts`:

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/admin/two-factor', () => ({
  verifyTotpCode: vi.fn(),
  verifyRecoveryCode: vi.fn(),
}));

import { verifyTotpCode, verifyRecoveryCode } from '@/lib/server/admin/two-factor';
import { POST } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockVerifyTotp = vi.mocked(verifyTotpCode);
const mockVerifyRecovery = vi.mocked(verifyRecoveryCode);

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/2fa/verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/admin/2fa/verify', () => {
  it('issues cookies on a valid TOTP code and consumes the challenge', async () => {
    const superadmin = seedSuperadmin({ twoFactorSecret: 'iv:tag:data', twoFactorEnabled: true });
    prismaMock.adminTwoFactorChallenge.findUnique.mockResolvedValueOnce({
      id: 'challenge_1',
      userId: superadmin.id,
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
      user: superadmin,
    } as never);
    mockVerifyTotp.mockReturnValueOnce(true);
    prismaMock.adminTwoFactorChallenge.update.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ challengeId: 'challenge_1', code: '123456' }));
    expect(res.status).toBe(200);
    expect(res.cookies.get('app-token')).toBeDefined();
    expect(prismaMock.adminTwoFactorChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'challenge_1' } }),
    );
  });

  it('falls back to a recovery code and persists the shortened list', async () => {
    const superadmin = seedSuperadmin({
      twoFactorSecret: 'iv:tag:data',
      twoFactorEnabled: true,
      twoFactorRecoveryCodes: ['hash1', 'hash2'],
    });
    prismaMock.adminTwoFactorChallenge.findUnique.mockResolvedValueOnce({
      id: 'challenge_1',
      userId: superadmin.id,
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
      user: superadmin,
    } as never);
    mockVerifyTotp.mockReturnValueOnce(false);
    mockVerifyRecovery.mockResolvedValueOnce({ ok: true, remaining: ['hash2'] });
    prismaMock.adminTwoFactorChallenge.update.mockResolvedValueOnce({} as never);
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ challengeId: 'challenge_1', code: 'deadbeef01' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: superadmin.id },
        data: { twoFactorRecoveryCodes: ['hash2'] },
      }),
    );
  });

  it('rejects an expired challenge', async () => {
    prismaMock.adminTwoFactorChallenge.findUnique.mockResolvedValueOnce({
      id: 'challenge_1',
      userId: 'u1',
      expiresAt: new Date(Date.now() - 1000),
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
      user: seedSuperadmin(),
    } as never);

    const res = await POST(makePost({ challengeId: 'challenge_1', code: '123456' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('CHALLENGE_EXPIRED');
  });

  it('rejects a wrong code without issuing cookies', async () => {
    const superadmin = seedSuperadmin({ twoFactorSecret: 'iv:tag:data', twoFactorEnabled: true });
    prismaMock.adminTwoFactorChallenge.findUnique.mockResolvedValueOnce({
      id: 'challenge_1',
      userId: superadmin.id,
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      consumedAt: null,
      createdAt: new Date(),
      user: superadmin,
    } as never);
    mockVerifyTotp.mockReturnValueOnce(false);
    mockVerifyRecovery.mockResolvedValueOnce({ ok: false, remaining: [] });
    prismaMock.adminTwoFactorChallenge.update.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ challengeId: 'challenge_1', code: '000000' }));
    expect(res.status).toBe(400);
    expect(res.cookies.get('app-token')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/2fa/verify/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/admin/2fa/verify/route.ts`:

```typescript
// POST /api/admin/2fa/verify — second step of SUPERADMIN login when 2FA is
// enabled. Accepts either a 6-digit TOTP code or a 10-char hex recovery
// code. Locks the challenge after 5 failed attempts (same spirit as the
// email lockout — bounded guesses against a short-lived token).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
  setCsrfCookie,
} from '@/lib/server/auth';
import { verifyTotpCode, verifyRecoveryCode } from '@/lib/server/admin/two-factor';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  challengeId: z.string().min(1),
  code: z.string().min(6).max(64),
});

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { challengeId, code } = parsed.data;

    const challenge = await prisma.adminTwoFactorChallenge.findUnique({
      where: { id: challengeId },
      include: { user: true },
    });

    if (!challenge || challenge.consumedAt) {
      return NextResponse.json(
        { error: 'CHALLENGE_NOT_FOUND', message: 'Invalid or already-used challenge.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'CHALLENGE_EXPIRED', message: 'This login attempt has expired. Log in again.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts. Log in again.' },
        { status: 429, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = challenge.user;
    let ok = false;
    let remainingRecoveryCodes: string[] | null = null;

    if (user.twoFactorSecret && verifyTotpCode(user.twoFactorSecret, code)) {
      ok = true;
    } else {
      const recoveryCodes = (user.twoFactorRecoveryCodes as string[] | null) ?? [];
      const recoveryResult = await verifyRecoveryCode(code, recoveryCodes);
      if (recoveryResult.ok) {
        ok = true;
        remainingRecoveryCodes = recoveryResult.remaining;
      }
    }

    if (!ok) {
      await prisma.adminTwoFactorChallenge.update({
        where: { id: challengeId },
        data: { attempts: { increment: 1 } },
      });
      return NextResponse.json(
        { error: 'INVALID_CODE', message: 'Invalid code.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.adminTwoFactorChallenge.update({
      where: { id: challengeId },
      data: { consumedAt: new Date() },
    });
    if (remainingRecoveryCodes !== null) {
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorRecoveryCodes: remainingRecoveryCodes },
      });
    }

    const accessToken = await createAccessToken({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = await createRefreshToken(user.id, user.tokenVersion);
    await setAuthCookies(accessToken, refreshToken);
    await setCsrfCookie();

    return NextResponse.json(
      { ok: true, admin: { id: user.id, email: user.email, role: user.role } },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/2fa/verify/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/admin/2fa/verify
git commit -m "feat(admin): add POST /api/admin/2fa/verify (TOTP + recovery code)"
```

---

### Task 7: `POST /api/admin/2fa/setup`, `/enable`, `/disable`

**Files:**
- Create: `frontend/src/app/api/admin/2fa/setup/route.ts`
- Create: `frontend/src/app/api/admin/2fa/enable/route.ts`
- Create: `frontend/src/app/api/admin/2fa/disable/route.ts`
- Test: `frontend/src/app/api/admin/2fa/setup/route.test.ts`, `frontend/src/app/api/admin/2fa/enable/route.test.ts`, `frontend/src/app/api/admin/2fa/disable/route.test.ts`

**Interfaces:**
- Consumes: `requireSuperadmin` from `@/lib/server/middleware`; `verifyCsrf` from `@/lib/server/auth`; `generateTotpSecret`, `verifyTotpCode`, `generateRecoveryCodes` from Task 4; `logAdminAction` from `@/lib/server/admin/audit`; `QRCode.toDataURL` from `qrcode`.
- Produces: `setup` returns `{ qrCodeDataUri, otpauthUri, recoveryCodes }` (secret stored encrypted but NOT yet enabled); `enable` flips `twoFactorEnabled: true` after confirming a code; `disable` requires password + a valid code.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/admin/2fa/setup/route.test.ts`:

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
});

import { requireSuperadmin } from '@/lib/server/middleware';
import { POST } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);

function makePost(): NextRequest {
  return new NextRequest('http://test/api/admin/2fa/setup', { method: 'POST' });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/admin/2fa/setup', () => {
  it('returns a QR data URI, otpauth URI, and 10 recovery codes; stores the secret unenabled', async () => {
    const superadmin = seedSuperadmin();
    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const res = await POST(makePost());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      qrCodeDataUri: string;
      otpauthUri: string;
      recoveryCodes: string[];
    };
    expect(body.qrCodeDataUri).toMatch(/^data:image\/png;base64,/);
    expect(body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(body.recoveryCodes).toHaveLength(10);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: superadmin.id },
        data: expect.objectContaining({ twoFactorEnabled: false }),
      }),
    );
  });

  it('propagates 403 from requireSuperadmin', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await POST(makePost());
    expect(res.status).toBe(403);
  });
});
```

Create `frontend/src/app/api/admin/2fa/enable/route.test.ts`:

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
});
vi.mock('@/lib/server/admin/two-factor', () => ({ verifyTotpCode: vi.fn() }));

import { requireSuperadmin } from '@/lib/server/middleware';
import { verifyTotpCode } from '@/lib/server/admin/two-factor';
import { POST } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockVerifyTotp = vi.mocked(verifyTotpCode);

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/2fa/enable', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/admin/2fa/enable', () => {
  it('enables 2FA when the confirmation code is valid', async () => {
    const superadmin = seedSuperadmin({ twoFactorSecret: 'iv:tag:data' });
    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(superadmin as never);
    mockVerifyTotp.mockReturnValueOnce(true);
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ code: '123456' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { twoFactorEnabled: true } }),
    );
    expect(prismaMock.adminAction.create).toHaveBeenCalled();
  });

  it('rejects an invalid confirmation code and does not enable', async () => {
    const superadmin = seedSuperadmin({ twoFactorSecret: 'iv:tag:data' });
    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(superadmin as never);
    mockVerifyTotp.mockReturnValueOnce(false);

    const res = await POST(makePost({ code: '000000' }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
```

Create `frontend/src/app/api/admin/2fa/disable/route.test.ts`:

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
});
vi.mock('@/lib/server/admin/two-factor', () => ({ verifyTotpCode: vi.fn() }));

import { requireSuperadmin } from '@/lib/server/middleware';
import { verifyTotpCode } from '@/lib/server/admin/two-factor';
import { POST } from './route';
import { seedSuperadmin } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockVerifyTotp = vi.mocked(verifyTotpCode);

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/2fa/disable', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/admin/2fa/disable', () => {
  it('disables 2FA when password and code are both valid', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 12);
    const superadmin = seedSuperadmin({ passwordHash, twoFactorSecret: 'iv:tag:data' });
    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(superadmin as never);
    mockVerifyTotp.mockReturnValueOnce(true);
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ password: 'correct-horse', code: '123456' }));
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: null },
      }),
    );
  });

  it('rejects a wrong password without disabling', async () => {
    const passwordHash = await bcrypt.hash('correct-horse', 12);
    const superadmin = seedSuperadmin({ passwordHash, twoFactorSecret: 'iv:tag:data' });
    mockRequireSuperadmin.mockResolvedValueOnce({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    prismaMock.user.findUnique.mockResolvedValueOnce(superadmin as never);

    const res = await POST(makePost({ password: 'wrong', code: '123456' }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run all three to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/2fa/setup src/app/api/admin/2fa/enable src/app/api/admin/2fa/disable`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `setup/route.ts`**

Create `frontend/src/app/api/admin/2fa/setup/route.ts`:

```typescript
// POST /api/admin/2fa/setup — SUPERADMIN generates a new TOTP secret +
// recovery codes. Stores the encrypted secret immediately but leaves
// twoFactorEnabled=false until /api/admin/2fa/enable confirms a code —
// prevents locking the account out on a QR-scan mistake.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { generateTotpSecret, generateRecoveryCodes } from '@/lib/server/admin/two-factor';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const { encryptedSecret, otpauthUri } = generateTotpSecret(auth.admin.email);
    const { plain: recoveryCodes, hashed } = generateRecoveryCodes();

    await prisma.user.update({
      where: { id: auth.admin.id },
      data: {
        twoFactorSecret: encryptedSecret,
        twoFactorEnabled: false,
        twoFactorRecoveryCodes: hashed,
      },
    });

    const qrCodeDataUri = await QRCode.toDataURL(otpauthUri);

    return NextResponse.json(
      { qrCodeDataUri, otpauthUri, recoveryCodes },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Implement `enable/route.ts`**

Create `frontend/src/app/api/admin/2fa/enable/route.ts`:

```typescript
// POST /api/admin/2fa/enable — confirms a code against the secret stored
// by /api/admin/2fa/setup, then flips twoFactorEnabled=true.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { verifyTotpCode } from '@/lib/server/admin/two-factor';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ code: z.string().min(6).max(6) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.admin.id },
      select: { twoFactorSecret: true },
    });
    if (!user?.twoFactorSecret || !verifyTotpCode(user.twoFactorSecret, parsed.data.code)) {
      return NextResponse.json(
        { error: 'INVALID_CODE', message: 'Invalid code. Run setup again if needed.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.user.update({
      where: { id: auth.admin.id },
      data: { twoFactorEnabled: true },
    });
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'admin.2fa_enabled',
      targetType: 'User',
      targetId: auth.admin.id,
    });

    return NextResponse.json({ ok: true }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 5: Implement `disable/route.ts`**

Create `frontend/src/app/api/admin/2fa/disable/route.ts`:

```typescript
// POST /api/admin/2fa/disable — requires BOTH password and a valid TOTP
// code (defense in depth: a stolen session cookie alone can't turn 2FA off).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf, verifyPassword } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { verifyTotpCode } from '@/lib/server/admin/two-factor';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ password: z.string().min(1), code: z.string().min(6).max(6) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.admin.id },
      select: { passwordHash: true, twoFactorSecret: true },
    });
    const passwordOk = user?.passwordHash
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : false;
    const codeOk = user?.twoFactorSecret
      ? verifyTotpCode(user.twoFactorSecret, parsed.data.code)
      : false;

    if (!passwordOk || !codeOk) {
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Invalid password or code.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.user.update({
      where: { id: auth.admin.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: null },
    });
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'admin.2fa_disabled',
      targetType: 'User',
      targetId: auth.admin.id,
    });

    return NextResponse.json({ ok: true }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 6: Run all three tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/2fa/setup src/app/api/admin/2fa/enable src/app/api/admin/2fa/disable`
Expected: PASS (6 tests total).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/api/admin/2fa
git commit -m "feat(admin): add 2FA setup/enable/disable routes for SUPERADMIN"
```

---

### Task 8: Outbox — admin invite email type + dispatcher case

**Files:**
- Modify: `frontend/src/lib/server/outbox/types.ts`
- Modify: `frontend/src/lib/server/outbox/dispatcher.ts` (PROTECTED — see step 1)
- Modify: `frontend/src/lib/server/auth/email-templates.ts`
- Test: `frontend/src/lib/server/outbox/dispatcher.test.ts` (extend existing, or create if none exists — check first)
- Test: `frontend/src/lib/server/auth/email-templates.test.ts` (extend existing, or create if none exists — check first)

**Interfaces:**
- Produces: `enqueueOutbox(tx, { kind: 'email.admin_invite', payload: { to, inviteUrl, role, expiresAt } })` — Task 9's invite-create route calls this. `adminInviteEmail(args): EmailTemplate` — new template factory.

- [ ] **Step 1: Stop and confirm with the user before editing `dispatcher.ts`**

This file is on CLAUDE.md's protected list ("atomic claim + backoff invariants"). Post this and wait for a yes:

> "I'm about to modify `frontend/src/lib/server/outbox/dispatcher.ts` (protected file) to add one new `case 'email.admin_invite':` to the existing `switch (event.kind)` in `dispatchEvent` — same shape as the existing `email.password_reset` case (render via a template factory, enqueue on the email queue). No changes to the claim/backoff/retry logic above it. Confirm before I proceed?"

Do not proceed to Step 3 without a yes. (If the user prefers to avoid this protected-file edit, the fallback is: send the invite email directly and synchronously from the invite-create route using `createMailer` from `@/lib/server/email` instead of going through the outbox — flag this as the alternative if they decline.)

- [ ] **Step 2: Check for existing dispatcher/email-template tests before writing new ones**

Run: `pnpm --filter frontend exec find src/lib/server/outbox src/lib/server/auth -name "*.test.ts"`
If `dispatcher.test.ts` and/or `email-templates.test.ts` already exist, add the new cases to those files instead of creating new ones (follow their existing `describe`/`it` structure and mock shape).

- [ ] **Step 3: Add the new template factory**

In `frontend/src/lib/server/auth/email-templates.ts`, add after `resetPasswordEmail`:

```typescript
export interface AdminInviteEmailArgs {
  inviteUrl: string;
  role: string;
  /** Optional ISO-8601 expiry; falls back to "soon" wording when omitted. */
  expiresAt?: string;
}

export function adminInviteEmail(args: AdminInviteEmailArgs): EmailTemplate {
  const url = htmlEscape(args.inviteUrl);
  const role = htmlEscape(args.role);
  const ttl = ttlWording(args.expiresAt);
  return {
    subject: 'Invitation à l’administration YeOyo',
    html: `<p>Bonjour,</p><p>Vous avez été invité(e) à rejoindre le back-office YeOyo avec le rôle <strong>${role}</strong>.</p><p><a href="${url}">Accepter l'invitation</a></p><p>Ce lien expire ${ttl}. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`,
    text: `Vous avez été invité(e) à rejoindre le back-office YeOyo avec le rôle ${args.role}. Accepter : ${args.inviteUrl}. Ce lien expire ${ttl}.`,
  };
}
```

- [ ] **Step 4: Add the outbox event type**

In `frontend/src/lib/server/outbox/types.ts`, add the new interface and register it in the union:

```typescript
export type OutboxEvent =
  | NotificationPaymentReceivedEvent
  | EmailPaymentConfirmationEvent
  | EmailVerificationCodeEvent
  | EmailPasswordResetEvent
  | EmailAdminInviteEvent;

// ... (after EmailPasswordResetEvent)

/**
 * Emitted by POST /api/admin/invites; consumed by the email-queue cron
 * (which calls adminInviteEmail() to render).
 */
export interface EmailAdminInviteEvent {
  kind: 'email.admin_invite';
  payload: {
    to: string;
    inviteUrl: string;
    role: string;
    expiresAt: string;
  };
}
```

- [ ] **Step 5: Add the dispatcher case**

In `frontend/src/lib/server/outbox/dispatcher.ts`, add a new `case` inside `dispatchEvent`'s `switch`, right after the existing `case 'email.password_reset':` block and before `default:`:

```typescript
    case 'email.admin_invite': {
      if (!deps.emailQueue) throw new Error('email queue not configured');
      const { adminInviteEmail } = await import('../auth/email-templates');
      const { to, inviteUrl, role, expiresAt } = event.payload;
      const tpl = adminInviteEmail({ inviteUrl, role, expiresAt });
      await deps.emailQueue.enqueue({ to, subject: tpl.subject, html: tpl.html });
      return;
    }
```

- [ ] **Step 6: Write/extend the tests**

Add to `frontend/src/lib/server/auth/email-templates.test.ts` (following whatever pattern the existing `verificationEmail`/`resetPasswordEmail` tests use in that file — read it first for the exact assertion style):

```typescript
describe('adminInviteEmail', () => {
  it('renders the invite URL and role, HTML-escaped', () => {
    const tpl = adminInviteEmail({
      inviteUrl: 'https://example.test/admin/invites/accept?token=abc',
      role: 'MODERATOR',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });
    expect(tpl.subject).toContain('Invitation');
    expect(tpl.html).toContain('https://example.test/admin/invites/accept?token=abc');
    expect(tpl.html).toContain('MODERATOR');
  });
});
```

Add to `frontend/src/lib/server/outbox/dispatcher.test.ts`, inside the existing `describe('drainOutbox (TEST-02)', ...)` block, reusing that file's own `makeRow()` helper and `prismaMock` (both already defined at the top of the file — no new imports needed beyond what's already there):

```typescript
it('dispatches email.admin_invite via the email queue', async () => {
  const row = makeRow({
    kind: 'email.admin_invite',
    payload: {
      to: 'invitee@test.local',
      inviteUrl: 'https://example.test/admin/invites/accept?token=abc',
      role: 'MODERATOR',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    },
  });
  prismaMock.outboxEvent.findMany.mockResolvedValue([{ id: 'oe_1' }] as never);
  prismaMock.outboxEvent.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.outboxEvent.findUnique.mockResolvedValue(row as never);
  prismaMock.outboxEvent.update.mockResolvedValue({} as never);
  const enqueue = vi.fn().mockResolvedValue(undefined);

  const stats = await drainOutbox({ prisma: prismaMock, emailQueue: { enqueue } });

  expect(stats.succeeded).toBe(1);
  expect(enqueue).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'invitee@test.local',
      subject: expect.stringContaining('Invitation'),
    }),
  );
});

it('email.admin_invite dispatch fails (and reschedules) when no email queue is configured', async () => {
  const row = makeRow({
    kind: 'email.admin_invite',
    payload: {
      to: 'invitee@test.local',
      inviteUrl: 'https://example.test/admin/invites/accept?token=abc',
      role: 'MODERATOR',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    },
    attempts: 1,
  });
  prismaMock.outboxEvent.findMany.mockResolvedValue([{ id: 'oe_1' }] as never);
  prismaMock.outboxEvent.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.outboxEvent.findUnique.mockResolvedValue(row as never);
  prismaMock.outboxEvent.update.mockResolvedValue({} as never);

  const stats = await drainOutbox({ prisma: prismaMock }); // no emailQueue

  expect(stats.failed).toBe(1);
  const finalUpdate = prismaMock.outboxEvent.update.mock.calls[0]?.[0];
  expect(finalUpdate?.data).toMatchObject({
    status: 'PENDING',
    lastError: 'email queue not configured',
  });
});
```

- [ ] **Step 7: Run the tests**

Run: `pnpm --filter frontend exec vitest run src/lib/server/outbox src/lib/server/auth/email-templates.test.ts`
Expected: PASS, including the new cases.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/server/outbox frontend/src/lib/server/auth/email-templates.ts frontend/src/lib/server/auth/email-templates.test.ts
git commit -m "feat(admin): add email.admin_invite outbox event + template"
```

---

### Task 9: Admin invite routes + role-enum extension

**Files:**
- Create: `frontend/src/app/api/admin/invites/route.ts` (GET list, POST create)
- Create: `frontend/src/app/api/admin/invites/[id]/revoke/route.ts`
- Create: `frontend/src/app/api/admin/invites/accept/route.ts`
- Modify: `frontend/src/app/api/admin/users/[id]/role/route.ts` (extend `z.enum` to include `'MODERATOR'`)
- Test: `frontend/src/app/api/admin/invites/route.test.ts`, `frontend/src/app/api/admin/invites/[id]/revoke/route.test.ts`, `frontend/src/app/api/admin/invites/accept/route.test.ts`

**Interfaces:**
- Consumes: `requireSuperadmin`, `verifyCsrf`, `logAdminAction`, `enqueueOutbox`, `hashPassword` from `@/lib/server/auth`, `clampLimit`/`cursorWhere`/`buildPage`/`decodeCursor` from pagination.
- Produces: nothing new consumed by later tasks in this plan besides the routes themselves, which Tasks 11/12 call from the frontend.

- [ ] **Step 1: Extend the role-change route's enum**

In `frontend/src/app/api/admin/users/[id]/role/route.ts`, change:

```typescript
const Body = z.object({
  role: z.enum(['USER', 'ADMIN', 'SUPERADMIN']),
});
```

to:

```typescript
const Body = z.object({
  role: z.enum(['USER', 'MODERATOR', 'ADMIN', 'SUPERADMIN']),
});
```

No other change needed in that file — the last-SUPERADMIN guard logic already only special-cases `'SUPERADMIN'`, which is unaffected by adding a role in between.

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/app/api/admin/invites/route.test.ts`:

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
});

import { requireSuperadmin } from '@/lib/server/middleware';
import { GET, POST } from './route';
import { seedSuperadmin, seedAdminInvite } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);

function makeGet(url = 'http://test/api/admin/invites'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}
function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/invites', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  const superadmin = seedSuperadmin();
  mockRequireSuperadmin.mockResolvedValue({
    user: { sub: superadmin.id, email: superadmin.email },
    admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
  });
});

describe('GET /api/admin/invites', () => {
  it('returns 200 with a paginated list', async () => {
    prismaMock.adminInvite.findMany.mockResolvedValueOnce([seedAdminInvite()] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it('propagates 403 from requireSuperadmin', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/invites', () => {
  it('creates an invite and enqueues the email, returns 201', async () => {
    prismaMock.$transaction.mockImplementationOnce(async (fn: never) =>
      (fn as (tx: typeof prismaMock) => unknown)(prismaMock),
    );
    prismaMock.adminInvite.create.mockResolvedValueOnce(
      seedAdminInvite({ email: 'new-mod@test.local', role: 'MODERATOR' }) as never,
    );
    prismaMock.outboxEvent.create.mockResolvedValueOnce({ id: 'outbox_1' } as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost({ email: 'new-mod@test.local', role: 'MODERATOR' }));
    expect(res.status).toBe(201);
    expect(prismaMock.adminInvite.create).toHaveBeenCalled();
    expect(prismaMock.outboxEvent.create).toHaveBeenCalled();
  });

  it('rejects an invalid role', async () => {
    const res = await POST(makePost({ email: 'x@test.local', role: 'OWNER' }));
    expect(res.status).toBe(400);
  });
});
```

Create `frontend/src/app/api/admin/invites/[id]/revoke/route.test.ts`:

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
});

import { requireSuperadmin } from '@/lib/server/middleware';
import { POST } from './route';
import { seedSuperadmin, seedAdminInvite } from '@/test-utils/admin-fixtures';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);

function makePost(): NextRequest {
  return new NextRequest('http://test/api/admin/invites/invite_1/revoke', { method: 'POST' });
}
function ctxWith(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  const superadmin = seedSuperadmin();
  mockRequireSuperadmin.mockResolvedValue({
    user: { sub: superadmin.id, email: superadmin.email },
    admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
  });
});

describe('POST /api/admin/invites/[id]/revoke', () => {
  it('revokes a pending invite', async () => {
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(seedAdminInvite() as never);
    prismaMock.adminInvite.update.mockResolvedValueOnce({} as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost(), ctxWith('invite_1'));
    expect(res.status).toBe(200);
    expect(prismaMock.adminInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
    );
  });

  it('404s for an unknown invite', async () => {
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(null as never);
    const res = await POST(makePost(), ctxWith('missing'));
    expect(res.status).toBe(404);
  });
});
```

Create `frontend/src/app/api/admin/invites/accept/route.test.ts`:

```typescript
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';
import { seedAdminInvite } from '@/test-utils/admin-fixtures';

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/invites/accept', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => vi.clearAllMocks());

describe('POST /api/admin/invites/accept', () => {
  it('creates the admin user and marks the invite accepted', async () => {
    const invite = seedAdminInvite({ email: 'new-mod@test.local', role: 'MODERATOR' });
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    prismaMock.$transaction.mockImplementationOnce(async (fn: never) =>
      (fn as (tx: typeof prismaMock) => unknown)(prismaMock),
    );
    prismaMock.user.create.mockResolvedValueOnce({ id: 'new_user_1' } as never);
    prismaMock.adminInvite.update.mockResolvedValueOnce({} as never);

    const res = await POST(
      makePost({ token: 'raw-token-value', password: 'a-strong-password-123' }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'new-mod@test.local', role: 'MODERATOR' }),
      }),
    );
  });

  it('rejects an expired invite', async () => {
    const invite = seedAdminInvite({ expiresAt: new Date(Date.now() - 1000) });
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);

    const res = await POST(makePost({ token: 'raw-token-value', password: 'x'.repeat(12) }));
    expect(res.status).toBe(400);
  });

  it('rejects an already-accepted invite', async () => {
    const invite = seedAdminInvite({ acceptedAt: new Date() });
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(invite as never);

    const res = await POST(makePost({ token: 'raw-token-value', password: 'x'.repeat(12) }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run all three to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/invites`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `frontend/src/app/api/admin/invites/route.ts`**

```typescript
// GET/POST /api/admin/invites — SUPERADMIN-only. GET lists invites
// (cursor-paginated, same shape as other admin listings). POST creates a
// new invite: generates a random token, stores only its SHA-256 hash
// (the raw token is mailed once and never persisted — same threat model
// as a password), enqueues the invite email via the outbox.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { zEmail } from '@/lib/server/zod-helpers';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enqueueOutbox } from '@/lib/server/outbox';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48h

const CreateBody = z.object({
  email: zEmail,
  role: z.enum(['MODERATOR', 'ADMIN', 'SUPERADMIN']),
});

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const rows = await prisma.adminInvite.findMany({
      where: { ...cursorWhere(cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        email: true,
        role: true,
        invitedById: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(buildPage(rows, limit), {
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { email, role } = parsed.data;

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const inviteUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/admin/invites/accept?token=${rawToken}`;

    const invite = await prisma.$transaction(async (tx) => {
      const created = await tx.adminInvite.create({
        data: { email, role, tokenHash, invitedById: auth.admin.id, expiresAt },
      });
      await enqueueOutbox(tx, {
        kind: 'email.admin_invite',
        payload: { to: email, inviteUrl, role, expiresAt: expiresAt.toISOString() },
      });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'admin.invite_created',
        targetType: 'AdminInvite',
        targetId: created.id,
        metadata: { email, role },
      });
      return created;
    });

    return NextResponse.json(
      { invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt } },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 5: Implement `frontend/src/app/api/admin/invites/[id]/revoke/route.ts`**

```typescript
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const invite = await prisma.adminInvite.findUnique({ where: { id } });
    if (!invite) {
      return NextResponse.json(
        { error: 'INVITE_NOT_FOUND', message: 'Invite not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await prisma.adminInvite.update({ where: { id }, data: { revokedAt: new Date() } });
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'admin.invite_revoked',
      targetType: 'AdminInvite',
      targetId: id,
      metadata: { email: invite.email },
    });

    return NextResponse.json({ ok: true }, { status: 200, headers: { 'x-request-id': reqCtx.requestId } });
  });
}
```

- [ ] **Step 6: Implement `frontend/src/app/api/admin/invites/accept/route.ts`**

```typescript
// POST /api/admin/invites/accept — public (pre-session) route. Sets the
// invitee's password, creates (or promotes) the User row, marks the
// invite accepted. Does NOT issue cookies — the new admin logs in
// separately via /api/admin/login, keeping the two flows independent.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { hashPassword } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  token: z.string().min(1),
  password: z.string().min(10),
});

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { token, password } = parsed.data;
    const tokenHash = hashToken(token);

    const invite = await prisma.adminInvite.findUnique({ where: { tokenHash } });
    if (!invite) {
      return NextResponse.json(
        { error: 'INVITE_NOT_FOUND', message: 'Invalid invitation link.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (invite.revokedAt) {
      return NextResponse.json(
        { error: 'INVITE_REVOKED', message: 'This invitation has been revoked.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (invite.acceptedAt) {
      return NextResponse.json(
        { error: 'INVITE_ALREADY_ACCEPTED', message: 'This invitation was already used.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'INVITE_EXPIRED', message: 'This invitation has expired.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const passwordHash = await hashPassword(password);
    const existing = await prisma.user.findUnique({ where: { email: invite.email } });

    await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.user.update({
          where: { id: existing.id },
          data: { role: invite.role, passwordHash, emailVerifiedAt: existing.emailVerifiedAt ?? new Date() },
        });
      } else {
        await tx.user.create({
          data: {
            email: invite.email,
            passwordHash,
            role: invite.role,
            emailVerifiedAt: new Date(),
          },
        });
      }
      await tx.adminInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    });

    return NextResponse.json({ ok: true }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 7: Run all the tests**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/invites src/app/api/admin/users`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/api/admin/invites frontend/src/app/api/admin/users
git commit -m "feat(admin): add invite create/list/revoke/accept routes; allow MODERATOR role change"
```

---

### Task 10: Restructure `/admin` route tree — login pages outside the auth guard

**Files:**
- Create: `frontend/src/app/admin/(dashboard)/layout.tsx` (moved from `frontend/src/app/admin/layout.tsx`)
- Move: `frontend/src/app/admin/page.tsx` → `frontend/src/app/admin/(dashboard)/page.tsx`
- Move: `frontend/src/app/admin/membres/` → `frontend/src/app/admin/(dashboard)/membres/`
- Move: `frontend/src/app/admin/verification/` → `frontend/src/app/admin/(dashboard)/verification/`
- Move: `frontend/src/app/admin/signalements/` → `frontend/src/app/admin/(dashboard)/signalements/`
- Create: `frontend/src/app/admin/login/page.tsx`
- Create: `frontend/src/app/admin/login/layout.tsx`
- Test: manual (Next.js route trees aren't unit-tested; verified via `pnpm build` + Task 14's full gate)

**Interfaces:**
- Produces: `/admin/login` renders outside the `AdminLayout` guard; `/admin`, `/admin/membres`, `/admin/verification`, `/admin/signalements` (and Tasks 11/12's `/admin/roles`, `/admin/2fa-setup`) stay behind it via the `(dashboard)` route group, which doesn't affect the URL path.

- [ ] **Step 1: Create the route group and move existing authenticated pages**

Run (from `frontend/src/app/admin/`):

```bash
mkdir -p "src/app/admin/(dashboard)"
git mv src/app/admin/page.tsx "src/app/admin/(dashboard)/page.tsx"
git mv src/app/admin/membres "src/app/admin/(dashboard)/membres"
git mv src/app/admin/verification "src/app/admin/(dashboard)/verification"
git mv src/app/admin/signalements "src/app/admin/(dashboard)/signalements"
git mv src/app/admin/layout.tsx "src/app/admin/(dashboard)/layout.tsx"
```

(Run from `frontend/`, adjust paths accordingly — the repo root is one level up from these `src/app/admin` paths.)

Expected: `frontend/src/app/admin/(dashboard)/` now contains `layout.tsx`, `page.tsx`, `membres/`, `verification/`, `signalements/`. The URL paths (`/admin`, `/admin/membres`, etc.) are unchanged — Next.js route groups `(name)` don't appear in the URL.

- [ ] **Step 2: Update the moved `layout.tsx`'s redirect target**

In `frontend/src/app/admin/(dashboard)/layout.tsx`, change both `router.replace('/')` calls (the 401 and generic-error branches inside the `catch`) to `router.replace('/admin/login')`:

```typescript
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) router.replace('/admin/login');
          else router.replace('/admin/login');
        }
      } finally {
```

- [ ] **Step 3: Create the login page's own minimal layout**

Create `frontend/src/app/admin/login/layout.tsx`:

```typescript
// Deliberately minimal — NOT wrapped by the (dashboard) group's
// AdminLayout guard (which would redirect here in a loop). No sidebar,
// no /api/admin/me probe.
import type { ReactNode } from 'react';

export default function AdminLoginLayout({ children }: { children: ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-background">{children}</main>;
}
```

- [ ] **Step 4: Create the login page**

Create `frontend/src/app/admin/login/page.tsx`:

```typescript
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

type Step =
  | { kind: 'credentials' }
  | { kind: 'twoFactor'; challengeId: string };

export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ ok?: boolean; twoFactorRequired?: boolean; challengeId?: string }>(
        '/api/admin/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
      );
      if (res.twoFactorRequired && res.challengeId) {
        setStep({ kind: 'twoFactor', challengeId: res.challengeId });
      } else {
        router.push('/admin');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (step.kind !== 'twoFactor') return;
    setError(null);
    setBusy(true);
    try {
      await api('/api/admin/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeId: step.challengeId, code }),
      });
      router.push('/admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code invalide.');
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === 'twoFactor') {
    return (
      <form onSubmit={submitCode} className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-6">
        <h1 className="font-headings text-lg font-bold text-foreground">Code de vérification</h1>
        <p className="font-body text-sm text-muted-foreground">
          Entrez le code de votre application d'authentification (ou un code de récupération).
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
          placeholder="123456"
        />
        {error && <p className="font-body text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Vérifier
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-6">
      <h1 className="font-headings text-lg font-bold text-foreground">YeOyo Admin</h1>
      <input
        type="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Mot de passe"
        className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
      />
      {error && <p className="font-body text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        Se connecter
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Verify the build**

Run: `pnpm --filter frontend run build`
Expected: build succeeds; route manifest includes `/admin/login` (public) and `/admin`, `/admin/membres`, `/admin/verification`, `/admin/signalements` (still under the guarded group, same URLs as before).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin
git commit -m "feat(admin): move authenticated admin pages into a route group; add /admin/login"
```

---

### Task 11: `/admin/roles` page + sidebar wiring

**Files:**
- Create: `frontend/src/app/admin/(dashboard)/roles/page.tsx`
- Modify: `frontend/src/components/admin/AdminSidebar.tsx`
- Modify: `frontend/src/app/admin/(dashboard)/layout.tsx` (pass `admin.role` to `AdminSidebar`)

**Interfaces:**
- Consumes: `GET /api/admin/invites`, `POST /api/admin/invites`, `POST /api/admin/invites/[id]/revoke`, `GET /api/admin/users`, `PATCH /api/admin/users/[id]/role` (existing).

- [ ] **Step 1: Add a `role` prop to `AdminSidebar` and gate the Rôles admin item**

In `frontend/src/components/admin/AdminSidebar.tsx`, add `role` to the props and a new nav entry, SUPERADMIN-only, plus hide "Membres" for MODERATOR:

```typescript
export function AdminSidebar({
  adminEmail,
  role,
  reportsCount,
  verificationCount,
  open,
  onClose,
}: {
  adminEmail: string;
  role: 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';
  reportsCount?: number | undefined;
  verificationCount?: number | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const groups: NavGroup[] = [
    { label: '', items: [{ href: '/admin', label: 'Dashboard' }] },
    {
      label: 'Utilisateurs',
      items: [
        ...(role !== 'MODERATOR' ? [{ href: '/admin/membres', label: 'Membres' }] : []),
        { href: '/admin/verification', label: 'Vérification IA', badge: verificationCount },
        { href: '/admin/signalements', label: 'Signalements', badge: reportsCount },
      ],
    },
    ...(role === 'SUPERADMIN'
      ? [{ label: 'Système', items: [{ href: '/admin/roles', label: 'Rôles admin' }] }]
      : []),
  ];
```

(Leave `inertGroups` as-is, minus removing "Système" from it if you added a real "Système" group above with the same label — rename the real one to avoid a duplicate heading, e.g. keep the real group labeled `'Administration'` instead of `'Système'` so it doesn't collide with the existing inert "Système" placeholder.) Use:

```typescript
    ...(role === 'SUPERADMIN'
      ? [{ label: 'Administration', items: [{ href: '/admin/roles', label: 'Rôles admin' }] }]
      : []),
```

- [ ] **Step 2: Pass `role` from the layout**

In `frontend/src/app/admin/(dashboard)/layout.tsx`, the `AdminMe` interface already has `admin.role` — pass it through to `AdminSidebar`:

```typescript
      <AdminSidebar
        adminEmail={admin.email}
        role={admin.role as 'MODERATOR' | 'ADMIN' | 'SUPERADMIN'}
        reportsCount={reportsCount}
        verificationCount={verificationCount}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
```

Also widen the `AdminMe` interface's `role` union to include `'MODERATOR'`:

```typescript
interface AdminMe {
  admin: { id: string; email: string; role: 'MODERATOR' | 'ADMIN' | 'SUPERADMIN' };
}
```

- [ ] **Step 3: Build the roles page**

Create `frontend/src/app/admin/(dashboard)/roles/page.tsx`:

```typescript
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';

interface AdminInviteRow {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export default function AdminRolesPage() {
  const [invites, setInvites] = useState<AdminInviteRow[]>([]);
  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MODERATOR');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [invitesRes, usersRes] = await Promise.all([
      api<{ items: AdminInviteRow[] }>('/api/admin/invites?limit=50'),
      api<{ items: AdminUserRow[] }>('/api/admin/users?role=MODERATOR&limit=50'),
    ]);
    setInvites(invitesRes.items);
    setAdmins(usersRes.items);
  }

  useEffect(() => {
    void load();
  }, []);

  async function sendInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/api/admin/invites', { method: 'POST', body: JSON.stringify({ email, role }) });
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de l'invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await api(`/api/admin/invites/${id}/revoke`, { method: 'POST' });
    await load();
  }

  async function changeRole(userId: string, newRole: string) {
    await api(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: newRole }),
    });
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-headings text-2xl font-bold text-foreground">Gestion des rôles admin</h1>

      <form onSubmit={sendInvite} className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-1">
          <label className="font-body text-xs text-muted-foreground">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-body text-xs text-muted-foreground">Rôle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
          >
            <option value="MODERATOR">Modérateur</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPERADMIN">Super Admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Inviter
        </button>
        {error && <p className="font-body text-sm text-destructive">{error}</p>}
      </form>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-3 font-headings text-sm font-bold text-foreground">Invitations</h2>
        <div className="flex flex-col gap-2">
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between font-body text-xs">
              <span className="text-foreground">{inv.email}</span>
              <span className="text-muted-foreground">{inv.role}</span>
              <span className="text-muted-foreground">
                {inv.acceptedAt ? 'Acceptée' : inv.revokedAt ? 'Révoquée' : 'En attente'}
              </span>
              {!inv.acceptedAt && !inv.revokedAt && (
                <button onClick={() => void revoke(inv.id)} className="text-destructive underline">
                  Révoquer
                </button>
              )}
            </div>
          ))}
          {invites.length === 0 && (
            <p className="font-body text-xs text-muted-foreground">Aucune invitation.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-3 font-headings text-sm font-bold text-foreground">Modérateurs</h2>
        <div className="flex flex-col gap-2">
          {admins.map((a) => (
            <div key={a.id} className="flex items-center justify-between font-body text-xs">
              <span className="text-foreground">{a.name ?? a.email}</span>
              <select
                defaultValue={a.role}
                onChange={(e) => void changeRole(a.id, e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
              >
                <option value="USER">Utilisateur</option>
                <option value="MODERATOR">Modérateur</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPERADMIN">Super Admin</option>
              </select>
            </div>
          ))}
          {admins.length === 0 && (
            <p className="font-body text-xs text-muted-foreground">Aucun modérateur.</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev` (from repo root), sign in as the bootstrapped SUPERADMIN (Task 13) at `/admin/login`, navigate to `/admin/roles`, invite a test email, confirm it appears in the "Invitations" list with status "En attente".

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/AdminSidebar.tsx "frontend/src/app/admin/(dashboard)"
git commit -m "feat(admin): add /admin/roles page (invite, list, revoke, role change)"
```

---

### Task 12: `/admin/2fa-setup` page

**Files:**
- Create: `frontend/src/app/admin/(dashboard)/2fa-setup/page.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/2fa/setup`, `POST /api/admin/2fa/enable`, `POST /api/admin/2fa/disable` (Task 7).

- [ ] **Step 1: Build the page**

Create `frontend/src/app/admin/(dashboard)/2fa-setup/page.tsx`:

```typescript
'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';

interface SetupResponse {
  qrCodeDataUri: string;
  otpauthUri: string;
  recoveryCodes: string[];
}

export default function TwoFactorSetupPage() {
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setError(null);
    setBusy(true);
    try {
      const res = await api<SetupResponse>('/api/admin/2fa/setup', { method: 'POST' });
      setSetup(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/api/admin/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
      setEnabled(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code invalide.');
    } finally {
      setBusy(false);
    }
  }

  if (enabled) {
    return <p className="font-body text-sm text-foreground">Authentification à deux facteurs activée.</p>;
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <h1 className="font-headings text-2xl font-bold text-foreground">
        Authentification à deux facteurs
      </h1>

      {!setup && (
        <button
          onClick={() => void startSetup()}
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Générer un code QR
        </button>
      )}

      {setup && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered data: URI, no optimization needed */}
          <img src={setup.qrCodeDataUri} alt="Code QR d'authentification" width={200} height={200} />
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="mb-2 font-body text-xs font-semibold text-foreground">
              Codes de récupération (à conserver, affichés une seule fois) :
            </p>
            <ul className="grid grid-cols-2 gap-1 font-body text-xs text-muted-foreground">
              {setup.recoveryCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <form onSubmit={confirmEnable} className="flex flex-col gap-2">
            <label className="font-body text-xs text-muted-foreground">
              Entrez le code affiché par votre application d'authentification pour confirmer :
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
              placeholder="123456"
            />
            {error && <p className="font-body text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Activer
            </button>
          </form>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke test**

Run: `pnpm dev`, sign in as SUPERADMIN, visit `/admin/2fa-setup`, generate a QR code, scan it with an authenticator app (Google Authenticator/Authy), enter the current 6-digit code, confirm it flips to "activée". Then log out and back in via `/admin/login` — confirm the 2FA code step appears.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/admin/(dashboard)/2fa-setup"
git commit -m "feat(admin): add /admin/2fa-setup page"
```

---

### Task 13: Bootstrap the initial SUPERADMIN (`jeffyengo@gmail.com`)

**Files:**
- Modify: `frontend/scripts/make-superadmin.ts`
- Test: `frontend/scripts/make-superadmin.test.ts` (extend existing — check first)

**Interfaces:**
- Produces: running `pnpm db:make-superadmin jeffyengo@gmail.com` creates the user (with a printed-once temp password) if absent, or promotes it if present.

- [ ] **Step 1: Check the existing test file's mock shape before editing**

Run: `pnpm --filter frontend exec find scripts -name "*.test.ts"`
Read `frontend/scripts/make-superadmin.test.ts` in full to match its existing `deps.prisma` mock pattern before adding new test cases.

- [ ] **Step 2: Extend the script to create-if-missing**

Modify `frontend/src/../scripts/make-superadmin.ts` — replace the `if (!user)` early-return block with a create-and-promote path:

```typescript
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
// ... (keep existing imports)

function generateTempPassword(): string {
  // 24 chars of base64url — well above AUTH_PASSWORD_MIN_LENGTH (default 10),
  // printed once, never logged or stored anywhere but the bcrypt hash.
  return randomBytes(18).toString('base64url');
}

export async function main(
  args: string[] = process.argv.slice(2),
  deps: RunDeps = {},
): Promise<number> {
  const email = args[0]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: pnpm db:make-superadmin <email>');
    return 1;
  }

  const prisma = deps.prisma ?? getPrisma();
  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 12);
      const created = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email,
            passwordHash,
            role: 'SUPERADMIN',
            emailVerifiedAt: new Date(),
          },
        });
        await logAdminAction(tx, {
          actorId: newUser.id,
          action: 'BOOTSTRAP_SUPERADMIN',
          targetType: 'User',
          targetId: newUser.id,
          metadata: { via: 'cli-script', previousRole: null, created: true },
        });
        return newUser;
      });
      console.log(`✓ Created SUPERADMIN ${email} (id=${created.id}).`);
      console.log(`  Temporary password (shown once): ${tempPassword}`);
      console.log('  Log in at /admin/login and change it immediately.');
      return 0;
    }

    if (user.role === 'SUPERADMIN') {
      console.log(`User ${email} is already SUPERADMIN — no-op.`);
      return 0;
    }

    const previousRole = user.role;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { role: 'SUPERADMIN' },
      });
      await logAdminAction(tx, {
        actorId: user.id,
        action: 'BOOTSTRAP_SUPERADMIN',
        targetType: 'User',
        targetId: user.id,
        metadata: { via: 'cli-script', previousRole },
      });
    });

    console.log(`✓ Promoted ${email} (id=${user.id}) to SUPERADMIN.`);
    return 0;
  } finally {
    if (!deps.prisma && prismaClient) {
      await prismaClient.$disconnect();
    }
  }
}
```

(Keep the rest of the file — imports of `PrismaClient`, `pathToFileURL`, `logAdminAction`, the `getPrisma()` lazy singleton, `RunDeps` interface, and the CLI entrypoint guard at the bottom — unchanged.)

- [ ] **Step 3: Add a test for the create-if-missing path**

Add to `frontend/scripts/make-superadmin.test.ts` (matching the existing file's mock-`deps.prisma` pattern exactly — read the existing "promotes an existing user" test first and mirror its setup):

```typescript
it('creates the user as SUPERADMIN with a printed temp password when absent', async () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'new_superadmin_1', email: 'jeffyengo@gmail.com' }),
    },
    $transaction: vi.fn(async (fn: never) => (fn as (tx: unknown) => unknown)(mockPrisma)),
    $disconnect: vi.fn(),
  };
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  const code = await main(['jeffyengo@gmail.com'], { prisma: mockPrisma as never });

  expect(code).toBe(0);
  expect(mockPrisma.user.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ email: 'jeffyengo@gmail.com', role: 'SUPERADMIN' }) }),
  );
  expect(logSpy.mock.calls.some((c) => String(c[0]).includes('Temporary password'))).toBe(true);

  logSpy.mockRestore();
});
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter frontend exec vitest run scripts/make-superadmin.test.ts`
Expected: PASS (existing tests + the new one).

- [ ] **Step 5: Run the bootstrap for real**

Run (against the dev database, after confirming `DATABASE_URL` in `.env` points where intended): `pnpm db:make-superadmin jeffyengo@gmail.com`
Expected: prints `✓ Created SUPERADMIN jeffyengo@gmail.com ...` and a one-time temporary password. Copy that password out of the terminal now — it is not logged anywhere else and cannot be retrieved later; if lost, use `/admin/login` → forgot-password flow (once that's wired in a later sub-project) or re-run `pnpm db:make-superadmin` after manually clearing `passwordHash`.

- [ ] **Step 6: Commit**

```bash
git add frontend/scripts/make-superadmin.ts frontend/scripts/make-superadmin.test.ts
git commit -m "feat(admin): bootstrap script creates the SUPERADMIN user if it doesn't exist yet"
```

---

### Task 14: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Format**

Run: `pnpm format`
Expected: no diff, or auto-fixes applied cleanly (re-stage if it modified files).

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: 0 errors.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors — this is the step most likely to surface the `admin-fixtures.ts` / new-Prisma-field mismatches from Task 1; fix any that appear before continuing.

- [ ] **Step 4: Full test suite**

Run: `pnpm test`
Expected: all tests green, including the pre-existing `runtime-enforcement.test.ts` (every new route under `frontend/src/app/api/admin/**` has `export const runtime = 'nodejs'` — verify this was not missed in any of Tasks 5–9) and any doc-shape tripwires under `frontend/src/lib/server/observability/`.

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: production build succeeds (catches route-tree issues from Task 10 that `pnpm dev` might not surface).

- [ ] **Step 6: Report**

Summarize to the user: what was built (MODERATOR role, `/admin/login` + 2FA, invites, `/admin/roles`, `/admin/2fa-setup`, bootstrapped SUPERADMIN), the one-time temp password location note, and that sub-project 2 (theme redesign) is next per the spec's 8-part decomposition.

---
