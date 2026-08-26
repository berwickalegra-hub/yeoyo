# Affiliate Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-contained "Affilié" role to YeOyo — unique referral codes, permanent referral attribution at signup, a verification bonus (1500 FCFA female / 300 FCFA male, paid at most once per referred account ever), a 15% commission on male credit-pack purchases within 30 days of signup (computed on the net amount after Chariow's fee), an isolated affiliate-facing dashboard, and an admin-side payout-tracking view with manual "mark as paid".

**Architecture:** Reuse every existing mechanism instead of inventing new ones — the existing cookie/JWT auth stack (only a new role-gate `requireAffiliate`, sibling to `requireAdmin`), the existing `AdminInvite` email-invite/accept-password flow (extended to accept an affiliate-shaped invite instead of a new mechanism), the existing `AdminAction` audit log, and the two existing money-confirmation choke points (`POST /api/admin/verification-queue/[id]/process` for the bonus, `reconcileChariowOrder` for the commission — both already run inside a Prisma transaction, so the earning row is inserted in the same transaction as the event that earns it). No new libraries, no new payment rails, no new auth system.

**Tech Stack:** Next.js 16 App Router Route Handlers, Prisma 5 / Postgres (Neon), Zod, Vitest + `vitest-mock-extended` (`prismaMock`), Tailwind v4 (existing tokens only).

**Spec:** [docs/superpowers/specs/2026-08-26-affiliate-program-design.md](../specs/2026-08-26-affiliate-program-design.md) — this plan argues from that spec; read both. Section references below (`§2.1`, `§6.2`, …) point into it.

## Global Constraints

- Every Route Handler MUST `export const runtime = 'nodejs'`.
- Every mutating route calls `verifyCsrf(req)` before anything else (pre-session routes like `admin/invites/accept` are the sole exception, unchanged).
- Every admin mutation calls `logAdminAction(prisma | tx, {...})` — no exceptions.
- Money is always integer FCFA (`XOF`, no decimals) — never a float.
- Verification bonus: **at most one `AffiliateEarning` row with `type: 'VERIFICATION_BONUS'` per `referredUserId`, ever** — enforced by BOTH an application-level pre-check AND a Postgres partial unique index (`docs` §2.2). A duplicate-bonus attempt must never roll back the profile's legitimate verification.
- Commission amount: `netAmount = Math.round(order.amount * (1 - CHARIOW_PROVIDER_FEE_PCT / 100))`, `commission = Math.round(netAmount * 0.15)`. Only for `gender === 'HOMME'`, only when `referredByAffiliateId` is set, only when `paidAt <= referredUser.createdAt + 30 days`.
- `role` stays a plain `String` column everywhere (`User.role`, `AdminInvite.role`) — `'AFFILIATE'` is just a 5th string value, never a Prisma/DB enum migration.
- `requireAffiliate` rejects every role except the exact string `'AFFILIATE'` — it does NOT chain off the `USER < MODERATOR < ADMIN < SUPERADMIN` rank ladder in `require-admin.ts`, and it does not modify that file.
- No file in CLAUDE.md's protected list is modified by this plan (confirmed per-task below — every task only touches `middleware/index.ts`-adjacent new files, route handlers, or the schema).
- No new npm dependency, no new design-system component library — Tailwind v4 + the existing `Icon.tsx` map (extended with two lucide-react icons already available via the existing `lucide-react` dependency).

---

### Task 1: Schema migration — User fields, `AffiliateEarning` model, `AdminInvite.name`, env var

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create (generated then hand-edited): `frontend/prisma/migrations/<timestamp>_affiliate_program/migration.sql`
- Modify: `.env.example` (repo root)

**Interfaces:**
- Produces: `User.affiliateCode`, `User.referredByAffiliateId`, `User.referredByAffiliate`/`referredUsers` relation, `User.affiliateEarnings`/`earningsGenerated` relations, `AffiliateEarning` model (`id, affiliateId, referredUserId, type, amount, relatedOrderId, paidAt, createdAt`), `AdminInvite.name`. Every later task's Prisma calls (`tx.affiliateEarning.*`, `user.affiliateCode`, `user.referredByAffiliateId`) depend on this.

- [ ] **Step 1: Add the User fields, relations, and indexes**

  In `frontend/prisma/schema.prisma`, inside `model User { ... }`, change the `role` field comment and add the new fields/relations. Locate the existing block:

  ```prisma
  role                   String    @default("USER") // USER | MODERATOR | ADMIN | SUPERADMIN
  ```

  Replace with:

  ```prisma
  role                   String    @default("USER") // USER | MODERATOR | ADMIN | SUPERADMIN | AFFILIATE
  ```

  Locate the existing relations block ending with:

  ```prisma
    ownedOrganizations Organization[]       @relation("OrgOwner")
    memberships        OrganizationMember[] @relation("OrgMembership")

    @@index([email])
    @@index([role])
    @@index([status])
  }
  ```

  Replace with:

  ```prisma
    ownedOrganizations Organization[]       @relation("OrgOwner")
    memberships        OrganizationMember[] @relation("OrgMembership")

    // Affiliate program — a User with role="AFFILIATE" is a separate account
    // type (never a dating-app user in parallel), created only via
    // POST /api/admin/affiliates (SUPERADMIN-only, reuses the AdminInvite
    // flow). affiliateCode is generated once at account creation and never
    // regenerated (an already-shared referral link must stay valid).
    affiliateCode          String?   @unique

    // Filleul → parrain. Set exactly once, at signup (POST /api/auth/signup),
    // never modified afterward — permanent attribution. onDelete: SetNull so
    // a (hypothetical, not built in V1) affiliate-account deletion never
    // cascades into deleting the referred user.
    referredByAffiliateId  String?
    referredByAffiliate    User?     @relation("AffiliateReferrals", fields: [referredByAffiliateId], references: [id], onDelete: SetNull)
    referredUsers          User[]    @relation("AffiliateReferrals")

    affiliateEarnings      AffiliateEarning[] @relation("AffiliateEarnings")
    earningsGenerated      AffiliateEarning[] @relation("ReferredUserEarnings")

    @@index([email])
    @@index([role])
    @@index([status])
    @@index([affiliateCode])
    @@index([referredByAffiliateId])
  }
  ```

- [ ] **Step 2: Add `AdminInvite.name` and update its role comment**

  Locate:

  ```prisma
  model AdminInvite {
    id          String    @id @default(cuid())
    email       String
    role        String // MODERATOR | ADMIN | SUPERADMIN
  ```

  Replace with:

  ```prisma
  model AdminInvite {
    id          String    @id @default(cuid())
    email       String
    // Optional display name — only ever set by POST /api/admin/affiliates
    // (affiliate invites carry a name; MODERATOR/ADMIN/SUPERADMIN invites
    // from POST /api/admin/invites never set this, stays null for them).
    name        String?
    role        String // MODERATOR | ADMIN | SUPERADMIN | AFFILIATE
  ```

- [ ] **Step 3: Add the `AffiliateEarning` model**

  Add this new model directly after the closing `}` of `model AdminInvite { ... }`:

  ```prisma
  // ───────────────────────────────────────────────────────────────────────
  // Affiliate program — one row per real, confirmed earning event. Never
  // updated after creation except `paidAt` (set in bulk by
  // POST /api/admin/affiliates/[id]/mark-paid). A gain is only ever
  // inserted at the exact moment the underlying event is confirmed in the
  // database (profile actually flips to VERIFIED; Order actually flips to
  // PAID) — never speculatively, never reversed.
  // ───────────────────────────────────────────────────────────────────────
  model AffiliateEarning {
    id             String    @id @default(cuid())
    affiliateId    String
    affiliate      User      @relation("AffiliateEarnings", fields: [affiliateId], references: [id], onDelete: Cascade)
    referredUserId String
    referredUser   User      @relation("ReferredUserEarnings", fields: [referredUserId], references: [id], onDelete: Cascade)
    type           String // VERIFICATION_BONUS | CREDIT_COMMISSION
    amount         Int // FCFA, always positive
    // Set only for type=CREDIT_COMMISSION — informative reference to the
    // Order that triggered it, same non-strict-FK convention as
    // CreditTransaction.relatedOrderId (must never fail this insert).
    relatedOrderId String?
    // null = awaiting payout; timestamp = paid (see mark-paid route).
    paidAt         DateTime?
    createdAt      DateTime  @default(now())

    @@index([affiliateId, paidAt])
    @@index([referredUserId, type])
  }
  ```

- [ ] **Step 4: Generate the migration with `--create-only`, then hand-add the partial unique index**

  Run:

  ```bash
  pnpm --filter frontend exec prisma migrate dev --name affiliate_program --create-only
  ```

  This writes `frontend/prisma/migrations/<timestamp>_affiliate_program/migration.sql` from the schema diff. Open that generated file and append this raw SQL at the end (Prisma's `@@unique` cannot express a *partial* unique index — this MUST be hand-written, it will never appear in a future auto-generated diff):

  ```sql
  -- Enforces "at most one verification bonus per referred user, ever" at the
  -- database level, as a failsafe alongside the application-level check in
  -- POST /api/admin/verification-queue/[id]/process (Task 10). Does NOT
  -- constrain CREDIT_COMMISSION rows — a user can have many of those (one
  -- per purchase inside the 30-day window).
  CREATE UNIQUE INDEX "AffiliateEarning_one_verification_bonus_per_user"
    ON "AffiliateEarning" ("referredUserId")
    WHERE "type" = 'VERIFICATION_BONUS';
  ```

- [ ] **Step 5: Apply the migration**

  Run:

  ```bash
  pnpm db:migrate:dev
  ```

  Expected: Prisma detects the already-generated (not-yet-applied) migration, applies it, regenerates the client. Confirm with `pnpm db:migrate:status` — the new migration shows as applied.

- [ ] **Step 6: Document the new env var**

  In `.env.example` (repo root), locate the `8b. OPTIONAL — Chariow` section's closing lines:

  ```
  CHARIOW_PRODUCT_ID_15J=""
  CHARIOW_PRODUCT_ID_1M=""
  CHARIOW_PRODUCT_ID_3M=""
  CHARIOW_PRODUCT_ID_6M=""
  ```

  Immediately after that block (before the `9. OPTIONAL — Sentry` section), insert:

  ```

  # =============================================================================
  # 8c. OPTIONAL — Affiliate program
  # =============================================================================
  # Commission rate Chariow keeps on every payment (%). Used only to compute
  # the NET amount that affiliate credit-purchase commissions are based on
  # (15% of net — see docs/superpowers/specs/2026-08-26-affiliate-program-design.md
  # §6.2). Chariow's API does not report its own fee per transaction, so this
  # is the contractually-known rate, not a number their API returns. Defaults
  # to 15 if unset.
  CHARIOW_PROVIDER_FEE_PCT="15"

  ```

- [ ] **Step 7: Verify**

  Run `pnpm typecheck` — must pass (new Prisma Client types resolve). Run `pnpm test` — must still pass (no test yet exercises the new model, so this only confirms nothing broke).

- [ ] **Step 8: Commit**

  ```bash
  git add frontend/prisma/schema.prisma frontend/prisma/migrations .env.example
  git commit -m "feat(affiliate): add AffiliateEarning model, User/AdminInvite fields"
  ```

---

### Task 2: Test fixtures — `admin-fixtures.ts` affiliate support

**Files:**
- Modify: `frontend/src/test-utils/admin-fixtures.ts`

**Interfaces:**
- Consumes: `User` / nothing new from `@prisma/client` beyond what Task 1 adds.
- Produces: `seedAffiliate(overrides?)`, `seedAffiliateEarning(overrides?)`, widened `UserOverrides` (adds `role: 'AFFILIATE'`, `affiliateCode`, `referredByAffiliateId`). Every later task's tests use these.

- [ ] **Step 1: Widen `UserOverrides` and `buildUser`**

  In `frontend/src/test-utils/admin-fixtures.ts`, locate:

  ```ts
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
  ```

  Replace with:

  ```ts
  interface UserOverrides {
    id?: string;
    email?: string;
    role?: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPERADMIN' | 'AFFILIATE';
    status?: 'ACTIVE' | 'SUSPENDED';
    passwordHash?: string | null;
    emailVerifiedAt?: Date | null;
    twoFactorEnabled?: boolean;
    twoFactorSecret?: string | null;
    affiliateCode?: string | null;
    referredByAffiliateId?: string | null;
  }
  ```

  Locate `function buildUser(overrides: UserOverrides = {}): User {` and its returned object. Add two fields right after `status: overrides.status ?? 'ACTIVE',`:

  ```ts
      status: overrides.status ?? 'ACTIVE',
      affiliateCode: overrides.affiliateCode ?? null,
      referredByAffiliateId: overrides.referredByAffiliateId ?? null,
  ```

- [ ] **Step 2: Add `seedAffiliate`**

  Immediately after the existing `seedModerator` function, add:

  ```ts
  export function seedAffiliate(overrides: UserOverrides = {}): User {
    return buildUser({
      id: overrides.id ?? 'affiliate_seed_1',
      email: overrides.email ?? 'affiliate@test.local',
      role: 'AFFILIATE',
      status: overrides.status ?? 'ACTIVE',
      affiliateCode: overrides.affiliateCode ?? 'AFF23456',
      ...overrides,
    });
  }
  ```

- [ ] **Step 3: Add `seedAffiliateEarning`**

  At the end of the file, after `seedAdminInvite`, add:

  ```ts
  // ────────────────────────────────────────────────────────────────────
  // Affiliate program — earning row fixture
  // ────────────────────────────────────────────────────────────────────

  interface AffiliateEarningOverrides {
    id?: string;
    affiliateId?: string;
    referredUserId?: string;
    type?: 'VERIFICATION_BONUS' | 'CREDIT_COMMISSION';
    amount?: number;
    relatedOrderId?: string | null;
    paidAt?: Date | null;
  }

  export function seedAffiliateEarning(overrides: AffiliateEarningOverrides = {}) {
    return {
      id: overrides.id ?? `earning_${Math.random().toString(36).slice(2, 10)}`,
      affiliateId: overrides.affiliateId ?? 'affiliate_seed_1',
      referredUserId: overrides.referredUserId ?? 'user_seed_1',
      type: overrides.type ?? 'VERIFICATION_BONUS',
      amount: overrides.amount ?? 1500,
      relatedOrderId: overrides.relatedOrderId ?? null,
      paidAt: overrides.paidAt ?? null,
      createdAt: FROZEN_NOW,
    };
  }
  ```

- [ ] **Step 4: Verify**

  Run `pnpm typecheck` — must pass.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/test-utils/admin-fixtures.ts
  git commit -m "test: add affiliate fixtures to admin-fixtures.ts"
  ```

---

### Task 3: `requireAffiliate` middleware + affiliate-code generator

**Files:**
- Create: `frontend/src/lib/server/middleware/require-affiliate.ts`
- Create: `frontend/src/lib/server/middleware/require-affiliate.test.ts`
- Create: `frontend/src/lib/server/affiliates/code.ts`
- Create: `frontend/src/lib/server/affiliates/code.test.ts`

**Interfaces:**
- Consumes: `requireAuth` from `@/lib/server/middleware` (exported by the non-protected barrel `middleware/index.ts` — this task does NOT modify that file), `prisma` from `@/lib/server/prisma`.
- Produces: `requireAffiliate(authHeader?: string | null): Promise<AffiliateContext | NextResponse>` where `AffiliateContext = { user: { sub: string; email: string }; affiliate: { id: string; email: string; affiliateCode: string } }`. `generateUniqueAffiliateCode(): Promise<string>`. Task 5 (account creation), Task 6 (accept-route wiring), and Task 12 (`/api/affiliate/me`) all import these.

- [ ] **Step 1: Write the failing test for `requireAffiliate`**

  Create `frontend/src/lib/server/middleware/require-affiliate.test.ts`:

  ```ts
  import { prismaMock } from '@/test-utils/prisma-mock';
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { NextResponse } from 'next/server';

  vi.mock('@/lib/server/middleware', async () => {
    const actual =
      await vi.importActual<typeof import('@/lib/server/middleware')>('@/lib/server/middleware');
    return { ...actual, requireAuth: vi.fn() };
  });

  import { requireAuth } from '@/lib/server/middleware';
  import { requireAffiliate } from './require-affiliate';
  import { seedAffiliate, seedAdmin } from '@/test-utils/admin-fixtures';

  const mockRequireAuth = vi.mocked(requireAuth);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireAffiliate', () => {
    it('propagates a 401 from requireAuth unchanged', async () => {
      mockRequireAuth.mockResolvedValueOnce(
        NextResponse.json({ error: 'Missing token' }, { status: 401 }),
      );
      const res = await requireAffiliate();
      expect(res).toBeInstanceOf(NextResponse);
      expect((res as NextResponse).status).toBe(401);
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it('returns 403 AFFILIATE_REQUIRED for a non-affiliate role (e.g. SUPERADMIN)', async () => {
      const admin = seedAdmin({ role: 'SUPERADMIN' as never });
      mockRequireAuth.mockResolvedValueOnce({ user: { sub: admin.id, email: admin.email } });
      prismaMock.user.findUnique.mockResolvedValueOnce(admin as never);
      const res = await requireAffiliate();
      expect(res).toBeInstanceOf(NextResponse);
      const body = await (res as NextResponse).json();
      expect((res as NextResponse).status).toBe(403);
      expect(body.error).toBe('AFFILIATE_REQUIRED');
    });

    it('returns 403 for a plain USER', async () => {
      mockRequireAuth.mockResolvedValueOnce({ user: { sub: 'u1', email: 'u1@test.local' } });
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'u1',
        email: 'u1@test.local',
        role: 'USER',
        affiliateCode: null,
      } as never);
      const res = await requireAffiliate();
      expect((res as NextResponse).status).toBe(403);
    });

    it('resolves an AffiliateContext for role=AFFILIATE with a code', async () => {
      const affiliate = seedAffiliate();
      mockRequireAuth.mockResolvedValueOnce({
        user: { sub: affiliate.id, email: affiliate.email },
      });
      prismaMock.user.findUnique.mockResolvedValueOnce(affiliate as never);
      const ctx = await requireAffiliate();
      expect(ctx).toEqual({
        user: { sub: affiliate.id, email: affiliate.email },
        affiliate: {
          id: affiliate.id,
          email: affiliate.email,
          affiliateCode: affiliate.affiliateCode,
        },
      });
    });
  });
  ```

- [ ] **Step 2: Run it to verify it fails**

  Run: `pnpm --filter frontend exec vitest run src/lib/server/middleware/require-affiliate.test.ts`
  Expected: FAIL — `./require-affiliate` module not found.

- [ ] **Step 3: Implement `requireAffiliate`**

  Create `frontend/src/lib/server/middleware/require-affiliate.ts`:

  ```ts
  // Affiliate-role gate, sibling to require-admin.ts but deliberately NOT
  // part of the USER < MODERATOR < ADMIN < SUPERADMIN rank ladder —
  // AFFILIATE is an isolated role with its own space (/affilie/*), not a
  // rank on the admin hierarchy. Chains requireAuth (same cookie/JWT/CSRF
  // mechanics as every other role in the app — no new auth system) rather
  // than re-reading the token/cookie itself, matching how requireAdmin
  // chains requireAuth in middleware/index.ts.
  import 'server-only';
  import { NextResponse } from 'next/server';
  import { requireAuth } from './index';
  import { prisma } from '../prisma';

  export interface AffiliateContext {
    user: { sub: string; email: string };
    affiliate: { id: string; email: string; affiliateCode: string };
  }

  export async function requireAffiliate(
    authHeader?: string | null,
  ): Promise<AffiliateContext | NextResponse> {
    const auth = await requireAuth(authHeader);
    if (auth instanceof NextResponse) return auth;

    const user = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: { id: true, email: true, role: true, affiliateCode: true },
    });
    if (!user || user.role !== 'AFFILIATE' || !user.affiliateCode) {
      return NextResponse.json(
        { error: 'AFFILIATE_REQUIRED', message: 'Affiliate access required' },
        { status: 403 },
      );
    }
    return {
      user: auth.user,
      affiliate: { id: user.id, email: user.email, affiliateCode: user.affiliateCode },
    };
  }
  ```

- [ ] **Step 4: Run the test again to verify it passes**

  Run: `pnpm --filter frontend exec vitest run src/lib/server/middleware/require-affiliate.test.ts`
  Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing test for the code generator**

  Create `frontend/src/lib/server/affiliates/code.test.ts`:

  ```ts
  import { prismaMock } from '@/test-utils/prisma-mock';
  import { describe, it, expect, vi } from 'vitest';
  import { generateUniqueAffiliateCode } from './code';

  describe('generateUniqueAffiliateCode', () => {
    it('returns an 8-character uppercase code on the first try when unused', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
      const code = await generateUniqueAffiliateCode();
      expect(code).toMatch(/^[A-Z2-9]{8}$/);
      // Excludes visually-ambiguous characters.
      expect(code).not.toMatch(/[01OI]/);
    });

    it('retries on collision and returns the first free code', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ id: 'taken' } as never)
        .mockResolvedValueOnce(null as never);
      const code = await generateUniqueAffiliateCode();
      expect(code).toMatch(/^[A-Z2-9]{8}$/);
      expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting retries', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'taken' } as never);
      await expect(generateUniqueAffiliateCode()).rejects.toThrow();
    });
  });
  ```

- [ ] **Step 6: Run it to verify it fails**

  Run: `pnpm --filter frontend exec vitest run src/lib/server/affiliates/code.test.ts`
  Expected: FAIL — `./code` module not found.

- [ ] **Step 7: Implement the generator**

  Create `frontend/src/lib/server/affiliates/code.ts`:

  ```ts
  // Generates the short, human-shareable code an affiliate's referral link
  // carries (?promo=CODE). Excludes visually-ambiguous characters (0/O,
  // 1/I) since this is read aloud/typed by hand, not just clicked. Retries
  // on the vanishingly rare collision; a code is never regenerated once
  // assigned to a User (see requireAffiliate / accept-route wiring).
  import 'server-only';
  import { randomBytes } from 'node:crypto';
  import { prisma } from '../prisma';

  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
  const CODE_LENGTH = 8;
  const MAX_ATTEMPTS = 5;

  function randomCode(): string {
    const bytes = randomBytes(CODE_LENGTH);
    let out = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      out += ALPHABET[bytes[i]! % ALPHABET.length];
    }
    return out;
  }

  export async function generateUniqueAffiliateCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = randomCode();
      const existing = await prisma.user.findUnique({
        where: { affiliateCode: code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    throw new Error('generateUniqueAffiliateCode: exhausted retries');
  }
  ```

- [ ] **Step 8: Run both test files to verify they pass**

  Run: `pnpm --filter frontend exec vitest run src/lib/server/affiliates/code.test.ts src/lib/server/middleware/require-affiliate.test.ts`
  Expected: PASS (7 tests total).

- [ ] **Step 9: Commit**

  ```bash
  git add frontend/src/lib/server/middleware/require-affiliate.ts frontend/src/lib/server/middleware/require-affiliate.test.ts frontend/src/lib/server/affiliates/code.ts frontend/src/lib/server/affiliates/code.test.ts
  git commit -m "feat(affiliate): add requireAffiliate gate and referral-code generator"
  ```

---

### Task 4: `POST /api/admin/affiliates` — SUPERADMIN creates an affiliate account (invite)

**Files:**
- Create: `frontend/src/app/api/admin/affiliates/route.ts`
- Create: `frontend/src/app/api/admin/affiliates/route.test.ts`

**Interfaces:**
- Consumes: `requireSuperadmin` from `@/lib/server/middleware`, `verifyCsrf` from `@/lib/server/auth`, `logAdminAction` from `@/lib/server/admin/audit`, `enqueueOutbox` from `@/lib/server/outbox`, `zEmail` from `@/lib/server/zod-helpers`, `enforceAdminRateLimit` from `@/lib/server/middleware/rate-limit-by-userid`, the `adminInviteEmail` template (unchanged, already accepts any `role: string`).
- Produces: `POST /api/admin/affiliates` — body `{ email, name }`, 201 `{ invite: { id, email, expiresAt } }`. Writes an `AdminInvite` row with `role: 'AFFILIATE'` (same table Task 6's accept route reads).

This route is a sibling of `POST /api/admin/invites`, not a modification of it — kept separate so the existing MODERATOR/ADMIN/SUPERADMIN invite route and its tests are untouched, while still writing into the same `AdminInvite` table (per spec §4, "réutilise exactement le flux déjà en place").

- [ ] **Step 1: Write the failing test**

  Create `frontend/src/app/api/admin/affiliates/route.test.ts`:

  ```ts
  import { prismaMock } from '@/test-utils/prisma-mock';
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { NextRequest, NextResponse } from 'next/server';

  vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
  vi.mock('@/lib/server/auth', async () => {
    const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
    return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
  });
  vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
    enforceAdminRateLimit: vi.fn(),
  }));

  import { requireSuperadmin } from '@/lib/server/middleware';
  import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
  import { POST } from './route';
  import { seedSuperadmin, seedAdminInvite } from '@/test-utils/admin-fixtures';

  const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
  const mockRateLimit = vi.mocked(enforceAdminRateLimit);

  function makePost(body: unknown): NextRequest {
    return new NextRequest('http://test/api/admin/affiliates', {
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
    mockRateLimit.mockResolvedValue(null);
  });

  describe('POST /api/admin/affiliates', () => {
    it('creates an AFFILIATE-role invite, enqueues the email, logs the action, returns 201', async () => {
      prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
        if (typeof cb === 'function') {
          return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
        }
        return Promise.resolve(undefined);
      });
      prismaMock.adminInvite.create.mockResolvedValueOnce(
        seedAdminInvite({
          email: 'new-affiliate@test.local',
          role: 'AFFILIATE' as never,
        }) as never,
      );
      prismaMock.outboxEvent.create.mockResolvedValueOnce({ id: 'outbox_1' } as never);
      prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

      const res = await POST(makePost({ email: 'new-affiliate@test.local', name: 'Awa D.' }));
      expect(res.status).toBe(201);
      expect(prismaMock.adminInvite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'new-affiliate@test.local', role: 'AFFILIATE' }),
        }),
      );
      expect(prismaMock.outboxEvent.create).toHaveBeenCalled();
      expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'affiliate.create' }),
        }),
      );
    });

    it('rejects a missing name', async () => {
      const res = await POST(makePost({ email: 'x@test.local' }));
      expect(res.status).toBe(400);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('propagates 403 from requireSuperadmin', async () => {
      mockRequireSuperadmin.mockResolvedValueOnce(
        NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
      );
      const res = await POST(makePost({ email: 'x@test.local', name: 'X' }));
      expect(res.status).toBe(403);
    });
  });
  ```

- [ ] **Step 2: Run it to verify it fails**

  Run: `pnpm --filter frontend exec vitest run src/app/api/admin/affiliates/route.test.ts`
  Expected: FAIL — `./route` module not found.

- [ ] **Step 3: Implement the route**

  Create `frontend/src/app/api/admin/affiliates/route.ts`:

  ```ts
  // POST /api/admin/affiliates — SUPERADMIN-only. Creates an affiliate
  // account exactly like /api/admin/invites creates a MODERATOR/ADMIN/
  // SUPERADMIN — same AdminInvite table, same hashed-token email flow, same
  // pre-session accept route (frontend/src/app/api/admin/invites/accept) —
  // just role is hardcoded to 'AFFILIATE' and the audit action is
  // 'affiliate.create'. Kept as its own route (not a widened enum on
  // /api/admin/invites) so that route's existing behavior/tests stay
  // untouched.
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
  import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
  import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

  const INVITE_TTL_MS = 48 * 60 * 60 * 1000; // 48h — same TTL as admin invites

  const CreateBody = z.object({
    email: zEmail,
    name: z.string().trim().min(1).max(120),
  });

  function hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
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
      const { email, name } = parsed.data;

      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      const inviteUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/admin/invites/accept?token=${rawToken}`;

      const invite = await prisma.$transaction(async (tx) => {
        const created = await tx.adminInvite.create({
          data: { email, name, role: 'AFFILIATE', tokenHash, invitedById: auth.admin.id, expiresAt },
        });
        await enqueueOutbox(tx, {
          kind: 'email.admin_invite',
          payload: { to: email, inviteUrl, role: 'AFFILIATE', expiresAt: expiresAt.toISOString() },
        });
        await logAdminAction(tx, {
          actorId: auth.admin.id,
          action: 'affiliate.create',
          targetType: 'AdminInvite',
          targetId: created.id,
          metadata: { email, name },
        });
        return created;
      });

      return NextResponse.json(
        { invite: { id: invite.id, email: invite.email, expiresAt: invite.expiresAt } },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    });
  }
  ```

- [ ] **Step 4: Run the test again to verify it passes**

  Run: `pnpm --filter frontend exec vitest run src/app/api/admin/affiliates/route.test.ts`
  Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

  ```bash
  git add "frontend/src/app/api/admin/affiliates/route.ts" "frontend/src/app/api/admin/affiliates/route.test.ts"
  git commit -m "feat(affiliate): add POST /api/admin/affiliates (SUPERADMIN account creation)"
  ```

---

### Task 5: Wire `affiliateCode` generation into the invite-accept route

**Files:**
- Modify: `frontend/src/app/api/admin/invites/accept/route.ts`
- Modify: `frontend/src/app/api/admin/invites/accept/route.test.ts`

**Interfaces:**
- Consumes: `generateUniqueAffiliateCode` from `@/lib/server/affiliates/code` (Task 3).
- Produces: on accepting an `AFFILIATE`-role invite, the new/promoted `User` row gets `affiliateCode` set (generated once, never overwritten if already present).

This route is NOT in CLAUDE.md's protected list (only `middleware/index.ts`, `require-admin.ts`, `require-org-role.ts`, and a handful of named `lib/server/*` files are protected — this is a route handler under the fork's normal surface area).

- [ ] **Step 1: Read the existing test file's structure**

  Run: `pnpm --filter frontend exec vitest run src/app/api/admin/invites/accept/route.test.ts` to confirm the current baseline passes before touching anything (expected: PASS, establishes a clean starting point).

- [ ] **Step 2: Write the failing test for the new behavior**

  Open `frontend/src/app/api/admin/invites/accept/route.test.ts` and add these two `it` blocks inside the existing `describe(...)` (match the file's existing mocking setup — it already mocks `prismaMock`, `hashPassword`, `logAdminAction`, etc.; add this import alongside the existing ones at the top of the file):

  ```ts
  vi.mock('@/lib/server/affiliates/code', () => ({
    generateUniqueAffiliateCode: vi.fn(),
  }));
  ```

  ```ts
  import { generateUniqueAffiliateCode } from '@/lib/server/affiliates/code';
  const mockGenerateCode = vi.mocked(generateUniqueAffiliateCode);
  ```

  Then add (adjust `seedAdminInvite`/`prismaMock` call shapes to match whatever helper functions the existing file already uses for a valid, unaccepted, unexpired invite and a fresh `passwordHash` — mirror the file's existing "creates a new user" test exactly, only changing the invite's `role`):

  ```ts
  it('generates and sets affiliateCode when accepting an AFFILIATE invite (new user)', async () => {
    mockGenerateCode.mockResolvedValueOnce('AFF99988');
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(
      seedAdminInvite({ role: 'AFFILIATE' as never, email: 'aff@test.local' }) as never,
    );
    prismaMock.user.findUnique.mockResolvedValueOnce(null); // no existing user
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.adminInvite.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.user.create.mockResolvedValueOnce({ id: 'new_affiliate_1' } as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    const res = await POST(
      new NextRequest('http://test/api/admin/invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token: 'raw-token-value', password: 'a-strong-enough-password' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockGenerateCode).toHaveBeenCalledOnce();
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'AFFILIATE', affiliateCode: 'AFF99988' }),
      }),
    );
  });

  it('never regenerates affiliateCode when promoting an existing user who already has one', async () => {
    mockGenerateCode.mockResolvedValueOnce('AFF11122');
    prismaMock.adminInvite.findUnique.mockResolvedValueOnce(
      seedAdminInvite({ role: 'AFFILIATE' as never, email: 'aff2@test.local' }) as never,
    );
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'existing_1',
      email: 'aff2@test.local',
      affiliateCode: 'ALREADY1',
      emailVerifiedAt: new Date(),
    } as never);
    prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.adminInvite.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaMock.user.update.mockResolvedValueOnce({} as never);
    prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

    await POST(
      new NextRequest('http://test/api/admin/invites/accept', {
        method: 'POST',
        body: JSON.stringify({ token: 'raw-token-value-2', password: 'a-strong-enough-password' }),
      }),
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ affiliateCode: expect.anything() }),
      }),
    );
  });
  ```

- [ ] **Step 3: Run the tests to verify the new ones fail**

  Run: `pnpm --filter frontend exec vitest run src/app/api/admin/invites/accept/route.test.ts`
  Expected: the two new tests FAIL (no `affiliateCode` logic exists yet); pre-existing tests still PASS.

- [ ] **Step 4: Implement the wiring**

  In `frontend/src/app/api/admin/invites/accept/route.ts`, add the import near the top (alongside the other `@/lib/server/*` imports):

  ```ts
  import { generateUniqueAffiliateCode } from '@/lib/server/affiliates/code';
  ```

  Locate this block (right after the invite's `expiresAt` check passes, before `const passwordHash = await hashPassword(password);`):

  ```ts
      const passwordHash = await hashPassword(password);
      const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  ```

  Replace with:

  ```ts
      const passwordHash = await hashPassword(password);
      const existing = await prisma.user.findUnique({ where: { email: invite.email } });

      // Generated BEFORE entering the transaction — the code lookup itself
      // needs its own DB round-trip (collision check) and doesn't need to be
      // serializable with the invite-consumption write below. Only ever
      // generated for AFFILIATE-role invites; every other role leaves this
      // undefined and the code is never touched.
      const affiliateCode =
        invite.role === 'AFFILIATE' ? await generateUniqueAffiliateCode() : undefined;
  ```

  Then locate the existing-user branch:

  ```ts
        let userId: string;
        if (existing) {
          // Overwriting a live password + elevating role: bump tokenVersion
          // so every pre-existing session for this account is invalidated,
          // same as AUTH-09 change-password — otherwise a session opened
          // before the invite existed keeps working with the old
          // credentials/role after this write.
          await tx.user.update({
            where: { id: existing.id },
            data: {
              role: invite.role,
              passwordHash,
              emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
              tokenVersion: { increment: 1 },
            },
          });
          userId = existing.id;
        } else {
          const created = await tx.user.create({
            data: {
              email: invite.email,
              passwordHash,
              role: invite.role,
              emailVerifiedAt: new Date(),
            },
          });
          userId = created.id;
        }
  ```

  Replace with:

  ```ts
        let userId: string;
        if (existing) {
          // Overwriting a live password + elevating role: bump tokenVersion
          // so every pre-existing session for this account is invalidated,
          // same as AUTH-09 change-password — otherwise a session opened
          // before the invite existed keeps working with the old
          // credentials/role after this write. affiliateCode is set ONLY if
          // this account doesn't already have one — a link already shared
          // must stay valid (never regenerated).
          await tx.user.update({
            where: { id: existing.id },
            data: {
              role: invite.role,
              passwordHash,
              emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
              tokenVersion: { increment: 1 },
              ...(affiliateCode && !existing.affiliateCode ? { affiliateCode } : {}),
            },
          });
          userId = existing.id;
        } else {
          const created = await tx.user.create({
            data: {
              email: invite.email,
              passwordHash,
              role: invite.role,
              emailVerifiedAt: new Date(),
              ...(affiliateCode ? { affiliateCode } : {}),
            },
          });
          userId = created.id;
        }
  ```

- [ ] **Step 5: Run the tests to verify they all pass**

  Run: `pnpm --filter frontend exec vitest run src/app/api/admin/invites/accept/route.test.ts`
  Expected: PASS, including the two new tests and every pre-existing one.

- [ ] **Step 6: Commit**

  ```bash
  git add "frontend/src/app/api/admin/invites/accept/route.ts" "frontend/src/app/api/admin/invites/accept/route.test.ts"
  git commit -m "feat(affiliate): generate and persist affiliateCode on invite acceptance"
  ```

---

### Task 6: `GET /api/admin/affiliates` (list + owed totals) + `POST /api/admin/affiliates/[id]/mark-paid`

**Files:**
- Modify: `frontend/src/app/api/admin/affiliates/route.ts` (add `GET` alongside the existing `POST`)
- Modify: `frontend/src/app/api/admin/affiliates/route.test.ts` (add `GET` tests)
- Create: `frontend/src/app/api/admin/affiliates/[id]/mark-paid/route.ts`
- Create: `frontend/src/app/api/admin/affiliates/[id]/mark-paid/route.test.ts`

**Interfaces:**
- Consumes: `clampLimit, cursorWhere, buildPage, decodeCursor` from `@/lib/server/pagination/paginate`.
- Produces: `GET /api/admin/affiliates` → `{ items: [{ id, email, name, affiliateCode, createdAt, amountOwed, lastPaidAt }], nextCursor }`. `POST /api/admin/affiliates/[id]/mark-paid` → `{ ok: true, amount, count, paidAt }`. Task 13's admin UI page consumes both.

- [ ] **Step 1: Write the failing `GET` tests**

  In `frontend/src/app/api/admin/affiliates/route.test.ts`, add `GET` to the import from `./route` and add this `describe` block:

  ```ts
  import { GET, POST } from './route';
  ```

  ```ts
  describe('GET /api/admin/affiliates', () => {
    function makeGet(url = 'http://test/api/admin/affiliates'): NextRequest {
      return new NextRequest(url, { method: 'GET' });
    }

    it('returns affiliates with owed totals and last-paid dates', async () => {
      prismaMock.user.findMany.mockResolvedValueOnce([
        {
          id: 'aff_1',
          email: 'a1@test.local',
          name: 'Awa',
          affiliateCode: 'AFF00001',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ] as never);
      prismaMock.affiliateEarning.groupBy
        .mockResolvedValueOnce([{ affiliateId: 'aff_1', _sum: { amount: 4500 } }] as never)
        .mockResolvedValueOnce([
          { affiliateId: 'aff_1', _max: { paidAt: new Date('2026-08-10T00:00:00.000Z') } },
        ] as never);

      const res = await GET(makeGet());
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: { id: string; amountOwed: number; lastPaidAt: string | null }[];
      };
      expect(body.items).toHaveLength(1);
      expect(body.items[0]?.amountOwed).toBe(4500);
      expect(body.items[0]?.lastPaidAt).not.toBeNull();
    });

    it('propagates 403 from requireSuperadmin', async () => {
      mockRequireSuperadmin.mockResolvedValueOnce(
        NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
      );
      const res = await GET(makeGet());
      expect(res.status).toBe(403);
    });
  });
  ```

- [ ] **Step 2: Run it to verify it fails**

  Run: `pnpm --filter frontend exec vitest run src/app/api/admin/affiliates/route.test.ts`
  Expected: FAIL — `GET` is not exported from `./route`.

- [ ] **Step 3: Implement `GET`**

  In `frontend/src/app/api/admin/affiliates/route.ts`, add these imports alongside the existing ones:

  ```ts
  import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
  ```

  Append this function at the end of the file (after the existing `POST`):

  ```ts
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

      const rows = await prisma.user.findMany({
        where: { role: 'AFFILIATE', ...cursorWhere(cursor) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: { id: true, email: true, name: true, affiliateCode: true, createdAt: true },
      });
      const page = buildPage(rows, limit);
      const affiliateIds = page.items.map((u) => u.id);

      const [owedGroups, paidGroups] = await Promise.all([
        prisma.affiliateEarning.groupBy({
          by: ['affiliateId'],
          where: { affiliateId: { in: affiliateIds }, paidAt: null },
          _sum: { amount: true },
        }),
        prisma.affiliateEarning.groupBy({
          by: ['affiliateId'],
          where: { affiliateId: { in: affiliateIds }, paidAt: { not: null } },
          _max: { paidAt: true },
        }),
      ]);
      const owedMap = new Map(owedGroups.map((g) => [g.affiliateId, g._sum.amount ?? 0]));
      const lastPaidMap = new Map(paidGroups.map((g) => [g.affiliateId, g._max.paidAt]));

      const items = page.items.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        affiliateCode: u.affiliateCode,
        createdAt: u.createdAt,
        amountOwed: owedMap.get(u.id) ?? 0,
        lastPaidAt: lastPaidMap.get(u.id) ?? null,
      }));

      return NextResponse.json(
        { items, nextCursor: page.nextCursor },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    });
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `pnpm --filter frontend exec vitest run src/app/api/admin/affiliates/route.test.ts`
  Expected: PASS (5 tests total).

- [ ] **Step 5: Write the failing test for `mark-paid`**

  Create `frontend/src/app/api/admin/affiliates/[id]/mark-paid/route.test.ts`:

  ```ts
  import { prismaMock } from '@/test-utils/prisma-mock';
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { NextRequest, NextResponse } from 'next/server';

  vi.mock('@/lib/server/middleware', () => ({ requireSuperadmin: vi.fn() }));
  vi.mock('@/lib/server/auth', async () => {
    const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
    return { ...actual, verifyCsrf: vi.fn().mockReturnValue(null) };
  });
  vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
    enforceAdminRateLimit: vi.fn(),
  }));

  import { requireSuperadmin } from '@/lib/server/middleware';
  import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
  import { POST } from './route';
  import { seedSuperadmin } from '@/test-utils/admin-fixtures';

  const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
  const mockRateLimit = vi.mocked(enforceAdminRateLimit);

  function makePost(id: string): NextRequest {
    return new NextRequest(`http://test/api/admin/affiliates/${id}/mark-paid`, { method: 'POST' });
  }
  function ctxWith(id: string): { params: Promise<{ id: string }> } {
    return { params: Promise.resolve({ id }) };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    const superadmin = seedSuperadmin();
    mockRequireSuperadmin.mockResolvedValue({
      user: { sub: superadmin.id, email: superadmin.email },
      admin: { id: superadmin.id, email: superadmin.email, role: 'SUPERADMIN' as const },
    });
    mockRateLimit.mockResolvedValue(null);
  });

  describe('POST /api/admin/affiliates/[id]/mark-paid', () => {
    it('marks every currently-unpaid row paid and logs the total', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'aff_1',
        role: 'AFFILIATE',
      } as never);
      prismaMock.$transaction.mockImplementationOnce((cb: unknown) => {
        if (typeof cb === 'function') {
          return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
        }
        return Promise.resolve(undefined);
      });
      prismaMock.affiliateEarning.findMany.mockResolvedValueOnce([
        { amount: 1500 },
        { amount: 300 },
      ] as never);
      prismaMock.affiliateEarning.updateMany.mockResolvedValueOnce({ count: 2 });
      prismaMock.adminAction.create.mockResolvedValueOnce({} as never);

      const res = await POST(makePost('aff_1'), ctxWith('aff_1'));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { amount: number; count: number };
      expect(body.amount).toBe(1800);
      expect(body.count).toBe(2);
      expect(prismaMock.affiliateEarning.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { affiliateId: 'aff_1', paidAt: null },
          data: { paidAt: expect.any(Date) },
        }),
      );
      expect(prismaMock.adminAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'affiliate.mark_paid' }),
        }),
      );
    });

    it('returns 404 for a non-affiliate user id', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'u1', role: 'USER' } as never);
      const res = await POST(makePost('u1'), ctxWith('u1'));
      expect(res.status).toBe(404);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('propagates 403 from requireSuperadmin', async () => {
      mockRequireSuperadmin.mockResolvedValueOnce(
        NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
      );
      const res = await POST(makePost('aff_1'), ctxWith('aff_1'));
      expect(res.status).toBe(403);
    });
  });
  ```

- [ ] **Step 6: Run it to verify it fails**

  Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/affiliates/[id]/mark-paid/route.test.ts"`
  Expected: FAIL — `./route` module not found.

- [ ] **Step 7: Implement the route**

  Create `frontend/src/app/api/admin/affiliates/[id]/mark-paid/route.ts`:

  ```ts
  // POST /api/admin/affiliates/[id]/mark-paid — SUPERADMIN-only. Solds the
  // ENTIRE currently-unpaid balance for one affiliate in a single bulk
  // updateMany (no partial payout in V1 — see spec §10). Idempotent in the
  // sense that calling it again with nothing newly unpaid updates 0 rows
  // and logs amount:0, count:0 rather than erroring.
  export const runtime = 'nodejs';

  import 'server-only';
  import { NextResponse, type NextRequest } from 'next/server';
  import { verifyCsrf } from '@/lib/server/auth';
  import { requireSuperadmin } from '@/lib/server/middleware';
  import { prisma } from '@/lib/server/prisma';
  import { logAdminAction } from '@/lib/server/admin/audit';
  import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
  import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

  export async function POST(
    req: NextRequest,
    routeCtx: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> {
    const ctx = makeRequestContext(req.headers);
    return withRequestContext(ctx, async () => {
      const csrfFail = verifyCsrf(req);
      if (csrfFail) return csrfFail;

      const auth = await requireSuperadmin();
      if (auth instanceof NextResponse) return auth;

      const limited = await enforceAdminRateLimit(auth.admin.id);
      if (limited) return limited;

      const { id } = await routeCtx.params;
      const affiliate = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true },
      });
      if (!affiliate || affiliate.role !== 'AFFILIATE') {
        return NextResponse.json(
          { error: 'AFFILIATE_NOT_FOUND', message: 'Affiliate not found' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }

      const now = new Date();
      const result = await prisma.$transaction(async (tx) => {
        const unpaid = await tx.affiliateEarning.findMany({
          where: { affiliateId: id, paidAt: null },
          select: { amount: true },
        });
        const totalAmount = unpaid.reduce((sum, e) => sum + e.amount, 0);
        const updated = await tx.affiliateEarning.updateMany({
          where: { affiliateId: id, paidAt: null },
          data: { paidAt: now },
        });
        await logAdminAction(tx, {
          actorId: auth.admin.id,
          action: 'affiliate.mark_paid',
          targetType: 'User',
          targetId: id,
          metadata: { amount: totalAmount, count: updated.count },
        });
        return { amount: totalAmount, count: updated.count };
      });

      return NextResponse.json(
        { ok: true, ...result, paidAt: now },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    });
  }
  ```

- [ ] **Step 8: Run the test again to verify it passes**

  Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/affiliates/[id]/mark-paid/route.test.ts"`
  Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

  ```bash
  git add "frontend/src/app/api/admin/affiliates/route.ts" "frontend/src/app/api/admin/affiliates/route.test.ts" "frontend/src/app/api/admin/affiliates/[id]/mark-paid"
  git commit -m "feat(affiliate): add affiliates list (owed totals) and mark-paid routes"
  ```

---

### Task 7: `AdminSidebar.tsx` — "Affiliés" link (SUPERADMIN only)

**Files:**
- Modify: `frontend/src/components/admin/AdminSidebar.tsx`

**Interfaces:**
- Produces: a visible nav link to `/admin/affilies` when `role === 'SUPERADMIN'`. Task 13's admin page lives at that route.

This is a bounded UI change (no backend logic, no new test) — matches the existing conditional-group pattern already used for the `'Administration'` group in this same file.

- [ ] **Step 1: Add a SUPERADMIN-only "Finance" group**

  In `frontend/src/components/admin/AdminSidebar.tsx`, locate:

  ```tsx
    ...(role === 'SUPERADMIN'
      ? [
          {
            label: 'Administration',
            items: [
              { href: '/admin/roles', label: 'Rôles admin', icon: 'shield-check' as IconName },
              {
                href: '/admin/2fa-setup',
                label: 'Authentification à deux facteurs',
                icon: 'smartphone' as IconName,
              },
            ],
          },
        ]
      : []),
  ];
  ```

  Replace with:

  ```tsx
    ...(role === 'SUPERADMIN'
      ? [
          {
            label: 'Administration',
            items: [
              { href: '/admin/roles', label: 'Rôles admin', icon: 'shield-check' as IconName },
              {
                href: '/admin/2fa-setup',
                label: 'Authentification à deux facteurs',
                icon: 'smartphone' as IconName,
              },
            ],
          },
          {
            label: 'Finance',
            items: [
              { href: '/admin/affilies', label: 'Affiliés', icon: 'users' as IconName },
            ],
          },
        ]
      : []),
  ];
  ```

  Note: the pre-existing `inertGroups` array further down still renders its own placeholder `'Finance'` heading (`Abonnements`/`Transactions`, both inert "Bientôt" labels) — this produces two adjacent "Finance" headings for a SUPERADMIN (one live, one inert-placeholder). This is a pre-existing cosmetic quirk of the placeholder system, not a bug introduced here; leave `inertGroups` untouched (out of this task's scope, no functional impact — MODERATOR/ADMIN viewers never see the live one, so they still see exactly what they saw before).

- [ ] **Step 2: Verify**

  Run `pnpm typecheck` and `pnpm lint` — must both pass.

- [ ] **Step 3: Manual check**

  Start `pnpm dev:webpack` (or the existing dev command per this environment's Turbopack-path-with-spaces workaround), log in as a SUPERADMIN test account, open `/admin`, confirm the "Finance" group with "Affiliés" appears in the sidebar (link will 404 until Task 13 ships the page — expected at this point in the plan).

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/components/admin/AdminSidebar.tsx
  git commit -m "feat(affiliate): add Affiliés link to admin sidebar (SUPERADMIN only)"
  ```

---

### Task 8: Signup captures `promoCode` → `referredByAffiliateId`

**Files:**
- Modify: `frontend/src/app/api/auth/signup/route.ts`
- Create: `frontend/src/app/api/auth/signup/route.test.ts` (create if it doesn't already exist — check with `Glob` first; if it exists, add to it instead of overwriting)

**Interfaces:**
- Produces: `POST /api/auth/signup` body gains an optional `promoCode`. On a valid, existing `AFFILIATE`-role code, the new `User.referredByAffiliateId` is set inside the same transaction as account creation. An invalid/unknown code never blocks or errors the signup.

- [ ] **Step 0: Check whether a test file already exists**

  Run `Glob` for `frontend/src/app/api/auth/signup/route.test.ts`. If it exists, read it first and add the new `it` blocks into its existing `describe` (matching its existing mock setup) instead of following Step 1 verbatim as a fresh file.

- [ ] **Step 1: Write the failing tests**

  If no test file exists yet, create `frontend/src/app/api/auth/signup/route.test.ts`:

  ```ts
  import { prismaMock } from '@/test-utils/prisma-mock';
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { NextRequest } from 'next/server';

  vi.mock('@/lib/server/outbox', () => ({ enqueueOutbox: vi.fn() }));
  vi.mock('@/lib/server/outbox/drain-now', () => ({ drainOutboxNow: vi.fn() }));
  vi.mock('@/lib/server/auth/hibp', () => ({ isPwned: vi.fn().mockResolvedValue(false) }));

  import { POST } from './route';

  function makePost(body: unknown): NextRequest {
    return new NextRequest('http://test/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue(null); // no existing account by default
    prismaMock.$transaction.mockImplementation((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.user.create.mockResolvedValue({ id: 'new_user_1' } as never);
    prismaMock.verificationCode.create.mockResolvedValue({} as never);
    prismaMock.creditTransaction.create.mockResolvedValue({} as never);
    prismaMock.user.update.mockResolvedValue({} as never);
  });

  describe('POST /api/auth/signup — promoCode', () => {
    it('sets referredByAffiliateId when promoCode matches an AFFILIATE account', async () => {
      // First findUnique call = existing-email check (email lookup),
      // second = promo-code lookup by affiliateCode.
      prismaMock.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'affiliate_1', role: 'AFFILIATE' } as never);

      const res = await POST(
        makePost({ email: 'ref@test.local', password: 'a-strong-enough-password', promoCode: 'aff00001' }),
      );
      expect(res.status).toBe(201);
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ referredByAffiliateId: 'affiliate_1' }),
        }),
      );
    });

    it('never blocks signup on an unknown promoCode, and sets no referral', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      const res = await POST(
        makePost({ email: 'noref@test.local', password: 'a-strong-enough-password', promoCode: 'BOGUS999' }),
      );
      expect(res.status).toBe(201);
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ referredByAffiliateId: expect.anything() }),
        }),
      );
    });

    it('ignores a code that resolves to a non-AFFILIATE user', async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'someone', role: 'USER' } as never);
      const res = await POST(
        makePost({ email: 'noref2@test.local', password: 'a-strong-enough-password', promoCode: 'NOTANAFF' }),
      );
      expect(res.status).toBe(201);
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ referredByAffiliateId: expect.anything() }),
        }),
      );
    });

    it('signup with no promoCode at all still works, no promo lookup performed', async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      const res = await POST(
        makePost({ email: 'plain@test.local', password: 'a-strong-enough-password' }),
      );
      expect(res.status).toBe(201);
      expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1);
    });
  });
  ```

- [ ] **Step 2: Run it to verify the promoCode tests fail**

  Run: `pnpm --filter frontend exec vitest run src/app/api/auth/signup/route.test.ts`
  Expected: the 4 new tests FAIL (no `promoCode` handling exists yet).

- [ ] **Step 3: Implement the wiring**

  In `frontend/src/app/api/auth/signup/route.ts`, locate:

  ```ts
  const Body = z.object({
    email: zEmail,
    password: z.string().min(1),
  });
  ```

  Replace with:

  ```ts
  const Body = z.object({
    email: zEmail,
    password: z.string().min(1),
    // Optional affiliate referral code from the signup form (prefilled from
    // ?promo= on the onboarding URL, or typed manually). Case-insensitive —
    // normalized to uppercase before lookup since generateUniqueAffiliateCode
    // only ever produces uppercase codes.
    promoCode: z.string().trim().optional(),
  });
  ```

  Locate:

  ```ts
      const { email, password } = parsed.data;
  ```

  Replace with:

  ```ts
      const { email, password, promoCode } = parsed.data;
  ```

  Locate the new-user branch:

  ```ts
    // 5. New-user branch — hash + create User + VerificationCode + outbox.
    const passwordHash = await hashPassword(password);
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash },
        select: { id: true },
      });
  ```

  Replace with:

  ```ts
    // 5. New-user branch — hash + create User + VerificationCode + outbox.
    const passwordHash = await hashPassword(password);
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

    // Resolve the referring affiliate BEFORE the transaction — a bad/unknown
    // code must NEVER block or error signup, so this is a plain best-effort
    // lookup, not a guard. Only an AFFILIATE-role account can refer.
    let referredByAffiliateId: string | undefined;
    if (promoCode) {
      const affiliate = await prisma.user.findUnique({
        where: { affiliateCode: promoCode.toUpperCase() },
        select: { id: true, role: true },
      });
      if (affiliate && affiliate.role === 'AFFILIATE') {
        referredByAffiliateId = affiliate.id;
      }
    }

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, ...(referredByAffiliateId ? { referredByAffiliateId } : {}) },
        select: { id: true },
      });
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `pnpm --filter frontend exec vitest run src/app/api/auth/signup/route.test.ts`
  Expected: PASS, all promoCode tests plus any pre-existing tests in the file.

- [ ] **Step 5: Run the full signup-adjacent suite to check for regressions**

  Run: `pnpm --filter frontend exec vitest run src/app/api/auth`
  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add "frontend/src/app/api/auth/signup/route.ts" "frontend/src/app/api/auth/signup/route.test.ts"
  git commit -m "feat(affiliate): capture promoCode at signup as permanent referral attribution"
  ```

---

### Task 9: Onboarding page — promo-code field + `?promo=` prefill

**Files:**
- Modify: `frontend/src/app/onboarding/page.tsx`

**Interfaces:**
- Produces: a `promoCode` field on the signup step, submitted to `POST /api/auth/signup` (Task 8), prefilled from `window.location.search`'s `promo` param.

Bounded UI change — this codebase has no test coverage for `onboarding/page.tsx` (a client wizard page, not a route handler); verify manually per Step 4 instead.

- [ ] **Step 1: Add `promoCode` to `WizardData` and prefill it on mount**

  Locate:

  ```tsx
  interface WizardData {
    email: string;
    gender: 'HOMME' | 'FEMME' | null;
  ```

  Replace with:

  ```tsx
  interface WizardData {
    email: string;
    promoCode: string;
    gender: 'HOMME' | 'FEMME' | null;
  ```

  Locate:

  ```tsx
  const INITIAL_DATA: WizardData = {
    email: '',
    gender: null,
  ```

  Replace with:

  ```tsx
  const INITIAL_DATA: WizardData = {
    email: '',
    promoCode: '',
    gender: null,
  ```

  Locate the `useEffect` that revokes the photo-preview object URL:

  ```tsx
    useEffect(() => {
      if (!photoFile) {
        setPhotoPreview(null);
        return;
      }
      const url = URL.createObjectURL(photoFile);
      setPhotoPreview(url);
      return () => URL.revokeObjectURL(url);
    }, [photoFile]);
  ```

  Immediately after it, add a new one-time prefill effect (uses `window.location.search` directly rather than `useSearchParams`, matching this file's existing `typeof window === 'undefined'` convention in `readCsrfToken` rather than introducing a Suspense-boundary requirement):

  ```tsx
    // Prefills the promo field from an affiliate referral link
    // (https://yeoyo.net/onboarding?promo=CODE). Read once on mount — the
    // user can still edit or clear it manually afterward.
    useEffect(() => {
      if (typeof window === 'undefined') return;
      const promo = new URLSearchParams(window.location.search).get('promo');
      if (promo) setData((d) => ({ ...d, promoCode: promo }));
    }, []);
  ```

- [ ] **Step 2: Add the field to the signup form and to the submit call**

  Locate the password-confirm `<label>` block and the block right after it:

  ```tsx
            </label>

            {error && (
              <p role="alert" className="font-body text-sm text-red-500">
                {error}
              </p>
            )}
  ```

  Replace with:

  ```tsx
            </label>

            <label className="flex flex-col gap-2 font-body text-sm text-muted-foreground">
              Code promo (optionnel)
              <input
                type="text"
                autoComplete="off"
                value={data.promoCode}
                onChange={(e) => setData((d) => ({ ...d, promoCode: e.target.value }))}
                placeholder="Ex. AFF23456"
                className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm uppercase text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>

            {error && (
              <p role="alert" className="font-body text-sm text-red-500">
                {error}
              </p>
            )}
  ```

  Locate the submit call:

  ```tsx
      await api('/api/auth/signup', { method: 'POST', body: { email: data.email, password } });
  ```

  Replace with:

  ```tsx
      await api('/api/auth/signup', {
        method: 'POST',
        body: {
          email: data.email,
          password,
          ...(data.promoCode.trim() ? { promoCode: data.promoCode.trim() } : {}),
        },
      });
  ```

- [ ] **Step 3: Verify**

  Run `pnpm typecheck` and `pnpm lint` — must both pass.

- [ ] **Step 4: Manual check**

  Start the dev server, open `http://localhost:3000/onboarding?promo=TESTCODE`, confirm the "Code promo" field on the signup step is prefilled with `TESTCODE`; clear it, confirm it can be typed manually; complete a signup and confirm no error (backend accepts any string, invalid codes are silently ignored per Task 8).

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/app/onboarding/page.tsx
  git commit -m "feat(affiliate): add promo-code field to onboarding signup step"
  ```

---

### Task 10: Verification bonus — wire into `POST /api/admin/verification-queue/[id]/process`

**Files:**
- Modify: `frontend/src/app/api/admin/verification-queue/[id]/process/route.ts`
- Modify: `frontend/src/app/api/admin/verification-queue/[id]/process/route.test.ts`

**Interfaces:**
- Produces: on `APPROVE` of a profile whose `user.referredByAffiliateId` is set, inserts exactly one `AffiliateEarning(type: 'VERIFICATION_BONUS')` row in the SAME transaction as the `Profile.verificationStatus` update. Never inserts a second one for the same `referredUserId` (app-level check + DB partial-unique-index failsafe from Task 1, caught locally so a race never rolls back the profile update).

This route currently does a bare `prisma.profile.update(...)` (not a transaction) — this task changes it to `prisma.$transaction(...)`.

- [ ] **Step 1: Write the failing tests**

  In `frontend/src/app/api/admin/verification-queue/[id]/process/route.test.ts`, add this import near the top:

  ```ts
  import { seedProfile as _unused } from '@/test-utils/admin-fixtures'; // placeholder import removed below if unused
  ```

  (Skip the line above — it does not exist as a real export; instead, extend the file's own local `seedProfile` helper.) Locate:

  ```ts
  function seedProfile(overrides: Partial<{ id: string; verificationStatus: string }> = {}) {
    return {
      id: overrides.id ?? 'profile_1',
      userId: 'user_1',
      verificationStatus: overrides.verificationStatus ?? 'PENDING',
      verifiedAt: null,
    };
  }
  ```

  Replace with:

  ```ts
  function seedProfile(
    overrides: Partial<{
      id: string;
      userId: string;
      verificationStatus: string;
      gender: string;
      referredByAffiliateId: string | null;
    }> = {},
  ) {
    return {
      id: overrides.id ?? 'profile_1',
      userId: overrides.userId ?? 'user_1',
      verificationStatus: overrides.verificationStatus ?? 'PENDING',
      verifiedAt: null,
      gender: overrides.gender ?? 'HOMME',
      user: { id: overrides.userId ?? 'user_1', referredByAffiliateId: overrides.referredByAffiliateId ?? null },
    };
  }
  ```

  Because the route now wraps writes in `prisma.$transaction`, every existing test that mocks `prismaMock.profile.update` directly needs `prismaMock.$transaction` wired to run its callback against `prismaMock`. Add this to the `beforeEach`:

  ```ts
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(undefined);
  });
  ```

  Then add these new tests inside the existing `describe(...)` block:

  ```ts
  it('POST inserts a 300 FCFA VERIFICATION_BONUS for a referred HOMME on approve', async () => {
    const profile = seedProfile({ id: 'p_bonus_h', gender: 'HOMME', referredByAffiliateId: 'aff_1' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
    } as never);
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce(null);
    prismaMock.affiliateEarning.create.mockResolvedValueOnce({} as never);

    const res = await POST(makePost('p_bonus_h', { action: 'APPROVE' }), ctxWith('p_bonus_h'));
    expect(res.status).toBe(200);
    expect(prismaMock.affiliateEarning.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          affiliateId: 'aff_1',
          referredUserId: 'user_1',
          type: 'VERIFICATION_BONUS',
          amount: 300,
        }),
      }),
    );
  });

  it('POST inserts a 1500 FCFA VERIFICATION_BONUS for a referred FEMME on approve', async () => {
    const profile = seedProfile({ id: 'p_bonus_f', gender: 'FEMME', referredByAffiliateId: 'aff_1' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
    } as never);
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce(null);
    prismaMock.affiliateEarning.create.mockResolvedValueOnce({} as never);

    await POST(makePost('p_bonus_f', { action: 'APPROVE' }), ctxWith('p_bonus_f'));
    expect(prismaMock.affiliateEarning.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 1500 }) }),
    );
  });

  it('POST never inserts a bonus when the profile has no referring affiliate', async () => {
    const profile = seedProfile({ id: 'p_no_ref', referredByAffiliateId: null });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
    } as never);

    await POST(makePost('p_no_ref', { action: 'APPROVE' }), ctxWith('p_no_ref'));
    expect(prismaMock.affiliateEarning.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.affiliateEarning.create).not.toHaveBeenCalled();
  });

  it('POST never inserts a bonus on REJECT even with a referring affiliate', async () => {
    const profile = seedProfile({ id: 'p_reject', referredByAffiliateId: 'aff_1' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'REJECTED',
    } as never);

    await POST(makePost('p_reject', { action: 'REJECT' }), ctxWith('p_reject'));
    expect(prismaMock.affiliateEarning.create).not.toHaveBeenCalled();
  });

  it('POST never inserts a second bonus for the same referredUserId (app-level check)', async () => {
    const profile = seedProfile({ id: 'p_dup', referredByAffiliateId: 'aff_1' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
    } as never);
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce({ id: 'already_exists' } as never);

    const res = await POST(makePost('p_dup', { action: 'APPROVE' }), ctxWith('p_dup'));
    expect(res.status).toBe(200);
    expect(prismaMock.affiliateEarning.create).not.toHaveBeenCalled();
  });

  it('POST swallows a P2002 race from the partial unique index without failing the profile update', async () => {
    const profile = seedProfile({ id: 'p_race', referredByAffiliateId: 'aff_1' });
    prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
    prismaMock.profile.update.mockResolvedValueOnce({
      ...profile,
      verificationStatus: 'VERIFIED',
    } as never);
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce(null);
    prismaMock.affiliateEarning.create.mockRejectedValueOnce({ code: 'P2002' });

    const res = await POST(makePost('p_race', { action: 'APPROVE' }), ctxWith('p_race'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: { verificationStatus: string } };
    expect(body.profile.verificationStatus).toBe('VERIFIED');
  });
  ```

- [ ] **Step 2: Run the tests to verify the new ones fail (and confirm which existing ones now break)**

  Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/verification-queue/[id]/process/route.test.ts"`
  Expected: the 6 new tests FAIL; some pre-existing tests may also fail once Step 3 changes `profile.findUnique`'s select shape — that's expected and resolved by Step 3 below.

- [ ] **Step 3: Implement the wiring**

  In `frontend/src/app/api/admin/verification-queue/[id]/process/route.ts`, add this import near the top:

  ```ts
  import { logAdminAction } from '@/lib/server/admin/audit';
  ```

  (already present — no change needed there). Locate:

  ```ts
      const profile = await prisma.profile.findUnique({ where: { id } });
      if (!profile) {
  ```

  Replace with:

  ```ts
      const profile = await prisma.profile.findUnique({
        where: { id },
        include: { user: { select: { id: true, referredByAffiliateId: true } } },
      });
      if (!profile) {
  ```

  Locate:

  ```ts
      const approve = parsed.data.action === 'APPROVE';
      const updated = await prisma.profile.update({
        where: { id },
        data: {
          verificationStatus: approve ? 'VERIFIED' : 'REJECTED',
          ...(approve ? { verifiedAt: new Date() } : {}),
        },
      });

      await logAdminAction(prisma, {
        actorId: auth.admin.id,
        action: approve ? 'profile.verify' : 'profile.reject',
        targetType: 'Profile',
        targetId: id,
        metadata: {
          userId: profile.userId,
          ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
        },
      });
  ```

  Replace with:

  ```ts
      const approve = parsed.data.action === 'APPROVE';

      const updated = await prisma.$transaction(async (tx) => {
        const updatedProfile = await tx.profile.update({
          where: { id },
          data: {
            verificationStatus: approve ? 'VERIFIED' : 'REJECTED',
            ...(approve ? { verifiedAt: new Date() } : {}),
          },
        });

        // Affiliate verification bonus — approve-only, and only when this
        // profile's account was referred. Never runs on REJECT.
        if (approve && profile.user.referredByAffiliateId) {
          const existingBonus = await tx.affiliateEarning.findFirst({
            where: { referredUserId: profile.userId, type: 'VERIFICATION_BONUS' },
            select: { id: true },
          });
          if (!existingBonus) {
            try {
              await tx.affiliateEarning.create({
                data: {
                  affiliateId: profile.user.referredByAffiliateId,
                  referredUserId: profile.userId,
                  type: 'VERIFICATION_BONUS',
                  amount: profile.gender === 'FEMME' ? 1500 : 300,
                },
              });
            } catch (err) {
              // Postgres partial-unique-index failsafe (see migration
              // "AffiliateEarning_one_verification_bonus_per_user") — a
              // concurrent request already inserted the bonus between our
              // findFirst above and this create. The profile's verification
              // itself must still succeed, so this is swallowed, not
              // rethrown (duck-typed P2002 check, same pattern as
              // notifications/index.ts's dedupeKey catch).
              const isDuplicateKey =
                typeof err === 'object' &&
                err !== null &&
                'code' in err &&
                (err as { code?: unknown }).code === 'P2002';
              if (!isDuplicateKey) throw err;
            }
          }
        }

        await logAdminAction(tx, {
          actorId: auth.admin.id,
          action: approve ? 'profile.verify' : 'profile.reject',
          targetType: 'Profile',
          targetId: id,
          metadata: {
            userId: profile.userId,
            ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
          },
        });

        return updatedProfile;
      });
  ```

  This makes `logAdminAction`'s existing call site pass `tx` instead of `prisma` — already imported, no new import needed. Everything below this block (the `createNotification` call and the final `NextResponse.json`) stays exactly as-is — `updated` still refers to the returned profile row.

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/verification-queue/[id]/process/route.test.ts"`
  Expected: PASS — all pre-existing tests plus the 6 new ones.

- [ ] **Step 5: Commit**

  ```bash
  git add "frontend/src/app/api/admin/verification-queue/[id]/process/route.ts" "frontend/src/app/api/admin/verification-queue/[id]/process/route.test.ts"
  git commit -m "feat(affiliate): accrue verification bonus in the same tx as profile approval"
  ```

---

### Task 11: Credit-purchase commission — wire into `reconcileChariowOrder`

**Files:**
- Modify: `frontend/src/lib/server/credits/reconcile.ts`
- Create: `frontend/src/lib/server/credits/reconcile.test.ts`

**Interfaces:**
- Produces: inside `reconcileChariowOrder`'s existing transaction, right after `grantCredits` and before the `enqueueOutbox` calls, inserts one `AffiliateEarning(type: 'CREDIT_COMMISSION')` row when the purchasing user is male, was referred, and is still inside the 30-day window.

No `reconcile.test.ts` exists yet in this codebase — this task creates it from scratch, covering both the pre-existing reconcile behavior (so a regression here is caught) and the new commission logic.

- [ ] **Step 1: Write the failing tests**

  Create `frontend/src/lib/server/credits/reconcile.test.ts`:

  ```ts
  import { prismaMock } from '@/test-utils/prisma-mock';
  import { describe, it, expect, vi, beforeEach } from 'vitest';

  vi.mock('@/lib/server/payments/chariow-singleton', () => ({
    getChariowEnv: vi.fn().mockReturnValue({}),
    chariowBreaker: { execute: vi.fn((fn: () => unknown) => fn()) },
  }));
  vi.mock('@/lib/server/payments/chariow', () => ({ getSaleStatus: vi.fn() }));
  vi.mock('@/lib/server/credits/packs', () => ({
    getPack: vi.fn().mockReturnValue({
      id: 'decouverte',
      credits: 5,
      priceTotal: 1000,
      currency: 'XOF',
    }),
  }));
  vi.mock('@/lib/server/credits/ledger', () => ({
    grantCredits: vi.fn().mockResolvedValue({ balance: 5 }),
  }));
  vi.mock('@/lib/server/outbox', () => ({ enqueueOutbox: vi.fn() }));

  import { getSaleStatus } from '@/lib/server/payments/chariow';
  import { reconcileChariowOrder } from './reconcile';
  import { seedOrder } from '@/test-utils/admin-fixtures';

  const mockGetSaleStatus = vi.mocked(getSaleStatus);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CHARIOW_PROVIDER_FEE_PCT = '15';
    prismaMock.$transaction.mockImplementation((cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
      }
      return Promise.resolve(undefined);
    });
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
  });

  function seedSucceeded(overrides: Partial<{ amount: number; settledAt: Date }> = {}) {
    mockGetSaleStatus.mockResolvedValueOnce({
      status: 'succeeded',
      amount: overrides.amount ?? 100000, // 1000 XOF * 100 (toSmallestUnit)
      currency: 'XOF',
      settledAt: overrides.settledAt ?? new Date('2026-08-20T00:00:00.000Z'),
    } as never);
  }

  describe('reconcileChariowOrder — affiliate commission', () => {
    it('inserts a 15%-of-net CREDIT_COMMISSION for a referred HOMME inside the 30-day window', async () => {
      seedSucceeded();
      const order = seedOrder({
        id: 'order_1',
        userId: 'user_1',
        status: 'PENDING',
        providerChargeId: 'charge_1',
        amount: 100000,
        metadata: { packId: 'decouverte' },
      });
      prismaMock.order.findUnique.mockResolvedValueOnce(order as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        referredByAffiliateId: 'aff_1',
        profile: { gender: 'HOMME' },
      } as never);
      prismaMock.affiliateEarning.create.mockResolvedValueOnce({} as never);

      const result = await reconcileChariowOrder(prismaMock, 'order_1');
      expect(result.orderStatus).toBe('PAID');
      // netAmount = round(100000 * 0.85) = 85000; commission = round(85000 * 0.15) = 12750
      expect(prismaMock.affiliateEarning.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            affiliateId: 'aff_1',
            referredUserId: 'user_1',
            type: 'CREDIT_COMMISSION',
            amount: 12750,
            relatedOrderId: 'order_1',
          }),
        }),
      );
    });

    it('never inserts a commission for a referred FEMME', async () => {
      seedSucceeded();
      const order = seedOrder({
        id: 'order_2',
        userId: 'user_2',
        status: 'PENDING',
        providerChargeId: 'charge_2',
        amount: 100000,
        metadata: { packId: 'decouverte' },
      });
      prismaMock.order.findUnique.mockResolvedValueOnce(order as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        referredByAffiliateId: 'aff_1',
        profile: { gender: 'FEMME' },
      } as never);

      await reconcileChariowOrder(prismaMock, 'order_2');
      expect(prismaMock.affiliateEarning.create).not.toHaveBeenCalled();
    });

    it('never inserts a commission when there is no referring affiliate', async () => {
      seedSucceeded();
      const order = seedOrder({
        id: 'order_3',
        userId: 'user_3',
        status: 'PENDING',
        providerChargeId: 'charge_3',
        amount: 100000,
        metadata: { packId: 'decouverte' },
      });
      prismaMock.order.findUnique.mockResolvedValueOnce(order as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        referredByAffiliateId: null,
        profile: { gender: 'HOMME' },
      } as never);

      await reconcileChariowOrder(prismaMock, 'order_3');
      expect(prismaMock.affiliateEarning.create).not.toHaveBeenCalled();
    });

    it('never inserts a commission once the 30-day window has passed', async () => {
      seedSucceeded({ settledAt: new Date('2026-09-05T00:00:00.000Z') }); // 35 days after signup
      const order = seedOrder({
        id: 'order_4',
        userId: 'user_4',
        status: 'PENDING',
        providerChargeId: 'charge_4',
        amount: 100000,
        metadata: { packId: 'decouverte' },
      });
      prismaMock.order.findUnique.mockResolvedValueOnce(order as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        referredByAffiliateId: 'aff_1',
        profile: { gender: 'HOMME' },
      } as never);

      await reconcileChariowOrder(prismaMock, 'order_4');
      expect(prismaMock.affiliateEarning.create).not.toHaveBeenCalled();
    });

    it('respects a custom CHARIOW_PROVIDER_FEE_PCT', async () => {
      process.env.CHARIOW_PROVIDER_FEE_PCT = '10';
      seedSucceeded();
      const order = seedOrder({
        id: 'order_5',
        userId: 'user_5',
        status: 'PENDING',
        providerChargeId: 'charge_5',
        amount: 100000,
        metadata: { packId: 'decouverte' },
      });
      prismaMock.order.findUnique.mockResolvedValueOnce(order as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        referredByAffiliateId: 'aff_1',
        profile: { gender: 'HOMME' },
      } as never);
      prismaMock.affiliateEarning.create.mockResolvedValueOnce({} as never);

      await reconcileChariowOrder(prismaMock, 'order_5');
      // netAmount = round(100000 * 0.90) = 90000; commission = round(90000 * 0.15) = 13500
      expect(prismaMock.affiliateEarning.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amount: 13500 }) }),
      );
    });
  });
  ```

- [ ] **Step 2: Run it to verify the new tests fail**

  Run: `pnpm --filter frontend exec vitest run src/lib/server/credits/reconcile.test.ts`
  Expected: FAIL — no `affiliateEarning.create` call exists yet in `reconcileChariowOrder` (the pre-existing-behavior assertions embedded via `result.orderStatus` etc. should already pass once mocks are wired correctly; the commission-specific assertions fail).

- [ ] **Step 3: Implement the wiring**

  In `frontend/src/lib/server/credits/reconcile.ts`, locate:

  ```ts
    return prisma.$transaction(async (tx) => {
  ```

  This confirms the transaction shape is unchanged. Locate:

  ```ts
      const userId = order.userId as string;
      const { balance } = await grantCredits(tx, {
        userId,
        amount: pack.credits,
        type: 'PURCHASE',
        action: `credit_pack:${pack.id}`,
        relatedOrderId: order.id,
      });

      await enqueueOutbox(tx, {
        kind: 'notification.payment_received',
        payload: { userId, orderId: order.id, amount: order.amount, currency: order.currency },
      });
  ```

  Replace with:

  ```ts
      const userId = order.userId as string;
      const { balance } = await grantCredits(tx, {
        userId,
        amount: pack.credits,
        type: 'PURCHASE',
        action: `credit_pack:${pack.id}`,
        relatedOrderId: order.id,
      });

      // Affiliate commission — 15% of the NET amount (after Chariow's own
      // cut), only for a referred HOMME still inside the 30-day window from
      // signup. FEMME purchases never trigger this (messaging is free for
      // them in practice, but the condition stays explicit rather than
      // implicit — see reconcile.ts's design spec §6.2). Idempotence is
      // inherited for free from the Order-status CAS above: this whole
      // function body runs at most once per Order, so no separate guard is
      // needed here (unlike the verification bonus, which CAN legitimately
      // be re-attempted if a future flow resets verificationStatus).
      const referralUser = await tx.user.findUnique({
        where: { id: userId },
        select: { createdAt: true, referredByAffiliateId: true, profile: { select: { gender: true } } },
      });
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      if (
        referralUser?.referredByAffiliateId &&
        referralUser.profile?.gender === 'HOMME' &&
        paidAt.getTime() <= referralUser.createdAt.getTime() + THIRTY_DAYS_MS
      ) {
        const feePct = Number(process.env.CHARIOW_PROVIDER_FEE_PCT ?? 15);
        const netAmount = Math.round(order.amount * (1 - feePct / 100));
        const commission = Math.round(netAmount * 0.15);
        await tx.affiliateEarning.create({
          data: {
            affiliateId: referralUser.referredByAffiliateId,
            referredUserId: userId,
            type: 'CREDIT_COMMISSION',
            amount: commission,
            relatedOrderId: order.id,
          },
        });
      }

      await enqueueOutbox(tx, {
        kind: 'notification.payment_received',
        payload: { userId, orderId: order.id, amount: order.amount, currency: order.currency },
      });
  ```

  Note: `paidAt` here is the existing local variable already computed above (`const paidAt = remote.settledAt ?? order.createdAt;`) — no new fetch needed, reused exactly as-is.

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `pnpm --filter frontend exec vitest run src/lib/server/credits/reconcile.test.ts`
  Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/lib/server/credits/reconcile.ts frontend/src/lib/server/credits/reconcile.test.ts
  git commit -m "feat(affiliate): accrue 15% net commission on referred-male credit purchases"
  ```

---

### Task 12: `GET /api/affiliate/me`

**Files:**
- Create: `frontend/src/app/api/affiliate/me/route.ts`
- Create: `frontend/src/app/api/affiliate/me/route.test.ts`

**Interfaces:**
- Consumes: `requireAffiliate` from `@/lib/server/middleware/require-affiliate` (Task 3).
- Produces: single aggregated JSON response for the affiliate dashboard — `{ affiliateCode, referralUrl, counters: { totalSignups, verifiedMen, verifiedWomen }, earnings: { total, pending, paid, verificationBonusTotal, commissionTotal }, lastPaidAt, referredUsers: [{ firstName, verificationStatus, totalEarned }] }`. Task 14's dashboard page consumes this verbatim.

- [ ] **Step 1: Write the failing test**

  Create `frontend/src/app/api/affiliate/me/route.test.ts`:

  ```ts
  import { prismaMock } from '@/test-utils/prisma-mock';
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { NextRequest, NextResponse } from 'next/server';

  vi.mock('@/lib/server/middleware/require-affiliate', () => ({ requireAffiliate: vi.fn() }));

  import { requireAffiliate } from '@/lib/server/middleware/require-affiliate';
  import { GET } from './route';

  const mockRequireAffiliate = vi.mocked(requireAffiliate);

  function makeGet(): NextRequest {
    return new NextRequest('http://test/api/affiliate/me', { method: 'GET' });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAffiliate.mockResolvedValue({
      user: { sub: 'aff_1', email: 'aff@test.local' },
      affiliate: { id: 'aff_1', email: 'aff@test.local', affiliateCode: 'AFF23456' },
    });
  });

  describe('GET /api/affiliate/me', () => {
    it('aggregates counters, earnings breakdown, and referred-user list', async () => {
      prismaMock.user.count.mockResolvedValueOnce(3); // totalSignups
      prismaMock.profile.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2); // men, women verified
      prismaMock.affiliateEarning.findMany.mockResolvedValueOnce([
        { amount: 300, type: 'VERIFICATION_BONUS', paidAt: null, referredUserId: 'u1' },
        { amount: 1500, type: 'VERIFICATION_BONUS', paidAt: new Date('2026-08-15T00:00:00.000Z'), referredUserId: 'u2' },
        { amount: 12750, type: 'CREDIT_COMMISSION', paidAt: null, referredUserId: 'u1' },
      ] as never);
      prismaMock.user.findMany.mockResolvedValueOnce([
        { id: 'u1', createdAt: new Date(), profile: { firstName: 'Jean', verificationStatus: 'VERIFIED' } },
        { id: 'u2', createdAt: new Date(), profile: { firstName: 'Awa', verificationStatus: 'VERIFIED' } },
      ] as never);

      const res = await GET(makeGet());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.affiliateCode).toBe('AFF23456');
      expect(body.referralUrl).toContain('promo=AFF23456');
      expect(body.counters).toEqual({ totalSignups: 3, verifiedMen: 1, verifiedWomen: 2 });
      expect(body.earnings.total).toBe(14550);
      expect(body.earnings.pending).toBe(13050);
      expect(body.earnings.paid).toBe(1500);
      expect(body.referredUsers).toHaveLength(2);
      const jean = body.referredUsers.find((u: { firstName: string }) => u.firstName === 'Jean');
      expect(jean.totalEarned).toBe(13050);
    });

    it('propagates 403 from requireAffiliate', async () => {
      mockRequireAffiliate.mockResolvedValueOnce(
        NextResponse.json({ error: 'AFFILIATE_REQUIRED' }, { status: 403 }),
      );
      const res = await GET(makeGet());
      expect(res.status).toBe(403);
    });
  });
  ```

- [ ] **Step 2: Run it to verify it fails**

  Run: `pnpm --filter frontend exec vitest run src/app/api/affiliate/me/route.test.ts`
  Expected: FAIL — `./route` module not found.

- [ ] **Step 3: Implement the route**

  Create `frontend/src/app/api/affiliate/me/route.ts`:

  ```ts
  // GET /api/affiliate/me — the affiliate dashboard's single data source.
  // Aggregates everything the /affilie dashboard page needs in one
  // round-trip: code + shareable link, signup/verification counters,
  // earnings breakdown (total/pending/paid, by type), last payout date, and
  // a per-referred-user earnings list.
  export const runtime = 'nodejs';

  import 'server-only';
  import { NextResponse, type NextRequest } from 'next/server';
  import { requireAffiliate } from '@/lib/server/middleware/require-affiliate';
  import { prisma } from '@/lib/server/prisma';
  import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

  export async function GET(req: NextRequest): Promise<NextResponse> {
    const ctx = makeRequestContext(req.headers);
    return withRequestContext(ctx, async () => {
      const auth = await requireAffiliate();
      if (auth instanceof NextResponse) return auth;

      const affiliateId = auth.affiliate.id;

      const [totalSignups, verifiedMen, verifiedWomen, earnings, referredUsers] = await Promise.all([
        prisma.user.count({ where: { referredByAffiliateId: affiliateId } }),
        prisma.profile.count({
          where: {
            user: { referredByAffiliateId: affiliateId },
            gender: 'HOMME',
            verificationStatus: 'VERIFIED',
          },
        }),
        prisma.profile.count({
          where: {
            user: { referredByAffiliateId: affiliateId },
            gender: 'FEMME',
            verificationStatus: 'VERIFIED',
          },
        }),
        prisma.affiliateEarning.findMany({
          where: { affiliateId },
          select: { amount: true, type: true, paidAt: true, referredUserId: true },
        }),
        prisma.user.findMany({
          where: { referredByAffiliateId: affiliateId },
          select: {
            id: true,
            createdAt: true,
            profile: { select: { firstName: true, verificationStatus: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      const totalEarned = earnings.reduce((s, e) => s + e.amount, 0);
      const totalPending = earnings.filter((e) => !e.paidAt).reduce((s, e) => s + e.amount, 0);
      const totalPaid = earnings.filter((e) => !!e.paidAt).reduce((s, e) => s + e.amount, 0);
      const verificationBonusTotal = earnings
        .filter((e) => e.type === 'VERIFICATION_BONUS')
        .reduce((s, e) => s + e.amount, 0);
      const commissionTotal = earnings
        .filter((e) => e.type === 'CREDIT_COMMISSION')
        .reduce((s, e) => s + e.amount, 0);
      const lastPaidAt = earnings.reduce<Date | null>(
        (max, e) => (e.paidAt && (!max || e.paidAt > max) ? e.paidAt : max),
        null,
      );

      const earningsByUser = new Map<string, number>();
      for (const e of earnings) {
        earningsByUser.set(e.referredUserId, (earningsByUser.get(e.referredUserId) ?? 0) + e.amount);
      }

      const referredUserList = referredUsers.map((u) => ({
        firstName: u.profile?.firstName ?? null,
        verificationStatus: u.profile?.verificationStatus ?? null,
        totalEarned: earningsByUser.get(u.id) ?? 0,
      }));

      return NextResponse.json(
        {
          affiliateCode: auth.affiliate.affiliateCode,
          referralUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/onboarding?promo=${auth.affiliate.affiliateCode}`,
          counters: { totalSignups, verifiedMen, verifiedWomen },
          earnings: {
            total: totalEarned,
            pending: totalPending,
            paid: totalPaid,
            verificationBonusTotal,
            commissionTotal,
          },
          lastPaidAt,
          referredUsers: referredUserList,
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    });
  }
  ```

- [ ] **Step 4: Run the test again to verify it passes**

  Run: `pnpm --filter frontend exec vitest run src/app/api/affiliate/me/route.test.ts`
  Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

  ```bash
  git add "frontend/src/app/api/affiliate/me/route.ts" "frontend/src/app/api/affiliate/me/route.test.ts"
  git commit -m "feat(affiliate): add GET /api/affiliate/me dashboard aggregate"
  ```

---

### Task 13: Icon additions + the `/affilie` space (login, gated layout, dashboard page)

**Files:**
- Modify: `frontend/src/components/ui/Icon.tsx`
- Create: `frontend/src/app/affilie/login/page.tsx`
- Create: `frontend/src/app/affilie/login/layout.tsx`
- Create: `frontend/src/app/affilie/(dashboard)/layout.tsx`
- Create: `frontend/src/app/affilie/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/login` (unchanged, role-agnostic), `GET /api/affiliate/me` (Task 12), `api`/`ApiError` from `@/lib/api`.
- Produces: the affiliate-facing UI. Bounded UI work — no unit tests (this codebase has none for page components); verify manually per the final step.

- [ ] **Step 1: Add `copy` and `link` icons**

  In `frontend/src/components/ui/Icon.tsx`, locate the import block's alphabetical `L` entries:

  ```tsx
    Layers,
    LayoutDashboard,
    LayoutGrid,
    Lightbulb,
    Lock,
    LogIn,
    LogOut,
  ```

  Replace with:

  ```tsx
    Copy,
    Layers,
    LayoutDashboard,
    LayoutGrid,
    Lightbulb,
    Link2,
    Lock,
    LogIn,
    LogOut,
  ```

  Then locate the icon map's `layers: Layers,` line and add the two new entries anywhere in the map (alongside similarly-named ones for readability):

  ```tsx
    layers: Layers,
  ```

  Replace with:

  ```tsx
    layers: Layers,
    copy: Copy,
    link: Link2,
  ```

- [ ] **Step 2: Verify the icon additions**

  Run `pnpm typecheck` — must pass (confirms `Copy`/`Link2` are valid `lucide-react` exports and the map compiles).

- [ ] **Step 3: Affiliate login page**

  Create `frontend/src/app/affilie/login/layout.tsx` (mirrors `admin/login/layout.tsx` exactly — deliberately outside the dashboard group's guard):

  ```tsx
  // Deliberately minimal — NOT wrapped by the (dashboard) group's gated
  // layout (which would redirect here in a loop). No sidebar, no
  // /api/affiliate/me probe.
  import type { ReactNode } from 'react';

  export default function AffiliateLoginLayout({ children }: { children: ReactNode }) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">{children}</main>
    );
  }
  ```

  Create `frontend/src/app/affilie/login/page.tsx`:

  ```tsx
  'use client';

  import { useState, type FormEvent } from 'react';
  import { useRouter } from 'next/navigation';
  import { api, ApiError } from '@/lib/api';

  export default function AffiliateLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(e: FormEvent) {
      e.preventDefault();
      setError(null);
      setBusy(true);
      try {
        // Same login route every account type uses — only the account's
        // `role` determines what it can subsequently reach; there is no
        // separate affiliate auth system.
        await api('/api/auth/login', { method: 'POST', body: { email, password } });
        router.push('/affilie');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Connexion impossible.');
      } finally {
        setBusy(false);
      }
    }

    return (
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-6"
      >
        <h1 className="font-headings text-lg font-bold text-foreground">Espace Affilié YeOyo</h1>
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

- [ ] **Step 4: Gated dashboard layout**

  Create `frontend/src/app/affilie/(dashboard)/layout.tsx` (mirrors `admin/(dashboard)/layout.tsx`'s gating pattern, probing `/api/affiliate/me` instead of `/api/admin/me`):

  ```tsx
  // /affilie/(dashboard)/* shell — gates every affiliate route behind
  // GET /api/affiliate/me (403 AFFILIATE_REQUIRED → redirect to
  // /affilie/login). Lives in the (dashboard) group so /affilie/login
  // itself stays outside this guard.
  'use client';

  import { useEffect, useState, type ReactNode } from 'react';
  import { useRouter } from 'next/navigation';
  import { api, ApiError } from '@/lib/api';

  export default function AffiliateLayout({ children }: { children: ReactNode }) {
    const router = useRouter();
    const [checked, setChecked] = useState(false);
    const [ok, setOk] = useState(false);

    useEffect(() => {
      let cancelled = false;
      void (async () => {
        try {
          await api('/api/affiliate/me');
          if (!cancelled) setOk(true);
        } catch (err) {
          if (!cancelled) {
            void err; // AFFILIATE_REQUIRED (403) or unauthenticated (401) — same redirect either way
            router.replace('/affilie/login');
          }
        } finally {
          if (!cancelled) setChecked(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [router]);

    if (!checked || !ok) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background font-body text-sm text-muted-foreground">
          Vérification des accès…
        </main>
      );
    }

    return <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">{children}</div>;
  }
  ```

  Note: `ApiError` is imported but unused above only if the `catch` block doesn't reference `err.message` — since this layout doesn't need to display the error (it just redirects), remove the unused `ApiError` import to keep `pnpm lint` clean:

  ```tsx
  import { api } from '@/lib/api';
  ```

  (Use this corrected single-item import instead of `{ api, ApiError }` in the actual file.)

- [ ] **Step 5: Dashboard page**

  Create `frontend/src/app/affilie/(dashboard)/page.tsx`:

  ```tsx
  'use client';

  import { useEffect, useState } from 'react';
  import { api, ApiError } from '@/lib/api';
  import { useToast } from '@/contexts/ToastContext';
  import { Icon } from '@/components/ui/Icon';

  interface AffiliateMe {
    affiliateCode: string;
    referralUrl: string;
    counters: { totalSignups: number; verifiedMen: number; verifiedWomen: number };
    earnings: {
      total: number;
      pending: number;
      paid: number;
      verificationBonusTotal: number;
      commissionTotal: number;
    };
    lastPaidAt: string | null;
    referredUsers: { firstName: string | null; verificationStatus: string | null; totalEarned: number }[];
  }

  function formatFcfa(amount: number): string {
    return `${amount.toLocaleString('fr-FR')} FCFA`;
  }

  export default function AffiliateDashboardPage() {
    const { toast } = useToast();
    const [data, setData] = useState<AffiliateMe | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
      let cancelled = false;
      void (async () => {
        try {
          const res = await api<AffiliateMe>('/api/affiliate/me');
          if (!cancelled) setData(res);
        } catch (err) {
          if (!cancelled) toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [toast]);

    async function copyLink() {
      if (!data) return;
      try {
        await navigator.clipboard.writeText(data.referralUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast('Impossible de copier le lien', 'error');
      }
    }

    if (loading || !data) {
      return <p className="font-body text-sm text-muted-foreground">Chargement…</p>;
    }

    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-headings text-2xl font-bold text-foreground">Mon espace affilié</h1>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <p className="font-body text-sm text-muted-foreground">Ton code et ton lien de parrainage</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-primary/10 px-3 py-2 font-mono text-sm font-semibold text-primary">
              {data.affiliateCode}
            </span>
            <code className="flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
              {data.referralUrl}
            </code>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="btn-press flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-body text-xs font-semibold text-primary-foreground"
            >
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              {copied ? 'Copié' : 'Copier le lien'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="font-body text-xs text-muted-foreground">Inscriptions totales</p>
            <p className="font-headings text-2xl font-bold text-foreground">{data.counters.totalSignups}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="font-body text-xs text-muted-foreground">Hommes vérifiés</p>
            <p className="font-headings text-2xl font-bold text-foreground">{data.counters.verifiedMen}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="font-body text-xs text-muted-foreground">Femmes vérifiées</p>
            <p className="font-headings text-2xl font-bold text-foreground">{data.counters.verifiedWomen}</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-3 font-body text-sm font-semibold text-foreground">Gains</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <p className="font-body text-xs text-muted-foreground">Total gagné</p>
              <p className="font-headings text-xl font-bold text-foreground">{formatFcfa(data.earnings.total)}</p>
            </div>
            <div>
              <p className="font-body text-xs text-muted-foreground">En attente de versement</p>
              <p className="font-headings text-xl font-bold text-gold">{formatFcfa(data.earnings.pending)}</p>
            </div>
            <div>
              <p className="font-body text-xs text-muted-foreground">Déjà versé</p>
              <p className="font-headings text-xl font-bold text-verified">{formatFcfa(data.earnings.paid)}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-4 border-t border-border pt-3 font-body text-xs text-muted-foreground">
            <span>Primes de vérification : {formatFcfa(data.earnings.verificationBonusTotal)}</span>
            <span>Commissions crédits : {formatFcfa(data.earnings.commissionTotal)}</span>
          </div>
          {data.lastPaidAt && (
            <p className="mt-2 font-body text-xs text-muted-foreground">
              Dernier versement : {new Date(data.lastPaidAt).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-3 font-body text-sm font-semibold text-foreground">Mes filleuls</p>
          {data.referredUsers.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground">Aucun filleul pour le moment.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.referredUsers.map((u, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <div>
                    <p className="font-body text-sm text-foreground">{u.firstName ?? 'Sans profil'}</p>
                    <p className="font-body text-xs text-muted-foreground">{u.verificationStatus ?? '—'}</p>
                  </div>
                  <span className="font-body text-sm font-semibold text-foreground">
                    {formatFcfa(u.totalEarned)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 6: Verify**

  Run `pnpm typecheck` and `pnpm lint` — must both pass.

- [ ] **Step 7: Manual check**

  Start the dev server. Using an `AFFILIATE`-role test account (create one via Task 4's route + the accept flow, or seed one directly with `pnpm db:studio` for a quick manual check), visit `/affilie/login`, log in, confirm redirect to `/affilie` and the dashboard renders with the code/link/counters/earnings/referred-users sections. Confirm a plain `USER` or `ADMIN` session hitting `/affilie` gets redirected to `/affilie/login` (403 from `/api/affiliate/me`).

- [ ] **Step 8: Commit**

  ```bash
  git add frontend/src/components/ui/Icon.tsx frontend/src/app/affilie
  git commit -m "feat(affiliate): add /affilie login + gated dashboard"
  ```

---

### Task 14: Admin "Affiliés" page

**Files:**
- Create: `frontend/src/app/admin/(dashboard)/affilies/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/affiliates` and `POST /api/admin/affiliates/[id]/mark-paid` (Task 6), `POST /api/admin/affiliates` (Task 4).

Bounded UI work — no unit test (matches the pattern of every other `admin/(dashboard)/*/page.tsx` in this codebase, all UI-only with backend coverage instead). Verify manually per the final step.

- [ ] **Step 1: Implement the page**

  Create `frontend/src/app/admin/(dashboard)/affilies/page.tsx`:

  ```tsx
  // Admin — Affiliés. SUPERADMIN-only (enforced server-side by every route
  // this page calls; the sidebar link itself is also SUPERADMIN-gated, see
  // AdminSidebar.tsx). Lists affiliates with their currently-owed balance,
  // lets an admin create a new affiliate account (reuses the AdminInvite
  // email flow) and mark an affiliate's full balance as paid.
  'use client';

  import { useCallback, useEffect, useState, type FormEvent } from 'react';
  import { api, ApiError } from '@/lib/api';
  import { useToast } from '@/contexts/ToastContext';
  import { AdminTableSkeleton } from '@/components/yeoyo/AdminTableSkeleton';

  interface AffiliateRow {
    id: string;
    email: string;
    name: string | null;
    affiliateCode: string | null;
    createdAt: string;
    amountOwed: number;
    lastPaidAt: string | null;
  }

  function formatFcfa(amount: number): string {
    return `${amount.toLocaleString('fr-FR')} FCFA`;
  }

  export default function AdminAffiliesPage() {
    const { toast } = useToast();
    const [items, setItems] = useState<AffiliateRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [markingId, setMarkingId] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
      setLoading(true);
      try {
        const res = await api<{ items: AffiliateRow[] }>('/api/admin/affiliates?limit=50');
        setItems(res.items);
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
      } finally {
        setLoading(false);
      }
    }, [toast]);

    useEffect(() => {
      void load();
    }, [load]);

    async function createAffiliate(e: FormEvent) {
      e.preventDefault();
      if (!email.trim() || !name.trim()) {
        toast('Email et nom requis', 'error');
        return;
      }
      setCreating(true);
      try {
        await api('/api/admin/affiliates', { method: 'POST', body: { email, name } });
        toast('Invitation envoyée', 'success');
        setEmail('');
        setName('');
        void load();
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
      } finally {
        setCreating(false);
      }
    }

    async function markPaid(id: string) {
      setMarkingId(id);
      try {
        const res = await api<{ amount: number; count: number }>(
          `/api/admin/affiliates/${id}/mark-paid`,
          { method: 'POST' },
        );
        toast(`${formatFcfa(res.amount)} marqué(s) comme versé(s)`, 'success');
        void load();
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
      } finally {
        setMarkingId(null);
      }
    }

    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-headings text-2xl font-bold text-foreground">Affiliés</h1>

        <form
          onSubmit={createAffiliate}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-end"
        >
          <label className="flex flex-1 flex-col gap-1 font-body text-xs text-muted-foreground">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 font-body text-xs text-muted-foreground">
            Nom
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {creating ? 'Envoi…' : 'Inviter un affilié'}
          </button>
        </form>

        {loading ? (
          <AdminTableSkeleton rows={4} columns={5} />
        ) : (
          <div className="animate-fade-in overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-left font-body text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Dû</th>
                  <th className="px-4 py-3 font-medium">Dernier versement</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">{a.name ?? a.email}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {a.affiliateCode ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">
                        {formatFcfa(a.amountOwed)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {a.lastPaidAt ? new Date(a.lastPaidAt).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={a.amountOwed === 0 || markingId === a.id}
                        onClick={() => void markPaid(a.id)}
                        className="btn-press rounded-lg border border-border px-3 py-1 font-body text-xs text-primary disabled:opacity-50"
                      >
                        {markingId === a.id ? 'Marquage…' : 'Marquer comme payé'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && items.length === 0 && (
          <p className="font-body text-sm text-muted-foreground">Aucun affilié pour le moment.</p>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify**

  Run `pnpm typecheck` and `pnpm lint` — must both pass.

- [ ] **Step 3: Manual check**

  As a SUPERADMIN, open `/admin/affilies`, invite a test affiliate, confirm the invite email is enqueued (check `/admin` outbox tooling or dev logs per this project's existing email-dev-mode behavior), accept the invite as that affiliate, confirm it appears in the list, generate a bonus/commission via the flows from Tasks 10–11, confirm the owed amount updates, click "Marquer comme payé", confirm it zeroes out and the affiliate's own `/affilie` dashboard reflects the payout.

- [ ] **Step 4: Commit**

  ```bash
  git add "frontend/src/app/admin/(dashboard)/affilies/page.tsx"
  git commit -m "feat(affiliate): add admin Affiliés page (create + owed totals + mark-paid)"
  ```

---

## Self-Review

**Spec coverage** — every numbered spec section maps to a task:
- §2.1/§2.2 (schema + partial unique index) → Task 1
- §3.1/§3.2 (`requireAffiliate`, isolation) → Task 3
- §4 (account creation via AdminInvite reuse) → Tasks 4, 5
- §5 (promoCode capture + form) → Tasks 8, 9
- §6.1 (verification bonus) → Task 10
- §6.2 (credit commission) → Task 11
- §7 (`/affilie` space + `/api/affiliate/me`) → Tasks 12, 13
- §8 (admin Affiliés tab + list/mark-paid + sidebar link) → Tasks 6, 7, 14
- §9 (`CHARIOW_PROVIDER_FEE_PCT`) → Task 1, consumed in Task 11
- §10 (out-of-scope items) — none of Tasks 1–14 build automatic payout, public self-signup, partial payout, affiliate-deletion UI, full payout history, or multi-level referrals. Confirmed absent by design.
- §11 (test plan) — double-payment guard (Task 10, 2 tests), commission gating (Task 11, 5 tests), invalid promo code (Task 8, tests 2–3), `requireAffiliate` rejection matrix (Task 3, tests 1–3), `mark-paid` exact-scope semantics (Task 6, test 1 asserting the exact `where` clause).

**Placeholder scan** — no "TBD"/"add validation"/"similar to Task N" language; every step carries literal, runnable code or an exact shell command.

**Type consistency** — `AffiliateContext` (Task 3) is used identically in Tasks 12–13 (`auth.affiliate.id`, `auth.affiliate.affiliateCode`). `AffiliateEarning`'s `type` values (`'VERIFICATION_BONUS' | 'CREDIT_COMMISSION'`) are spelled identically across Tasks 1, 2, 10, 11, 12. `generateUniqueAffiliateCode` (Task 3) is imported with that exact name in Task 5. `requireAffiliate` (Task 3) is imported with that exact name and path (`@/lib/server/middleware/require-affiliate`) in Tasks 12 and 13. The `AffiliateMe` response shape is defined once in Task 12's route and consumed with matching field names in Task 13's dashboard page.
