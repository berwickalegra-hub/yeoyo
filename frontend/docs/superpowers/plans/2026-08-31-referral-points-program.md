# Programme de parrainage à points — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every regular user (not just admin-invited AFFILIATE accounts) earn points for verified referrals, auto-converted to spendable credits once they reach 100.

**Architecture:** Reuse the existing affiliate-code/promoCode/verification-bonus infrastructure end-to-end. Remove the AFFILIATE-only restriction on who a `promoCode` can resolve to at signup; branch the existing verification-bonus hook by the referrer's role (AFFILIATE → unchanged FCFA cash path, anyone else → new points path); add a `ReferralBonus` ledger table and a `referralPoints` counter on `User`; expose a small `GET /api/referral/me` endpoint with lazy code generation; surface it in a new "Parrainage" section on the existing Paiement settings page.

**Tech Stack:** Next.js 16 App Router Route Handlers, Prisma 5 / Neon Postgres, Vitest, React (client component).

**Spec:** [frontend/docs/superpowers/specs/2026-08-31-referral-points-program-design.md](../specs/2026-08-31-referral-points-program-design.md)

## Global Constraints

- Credit and point amounts are always integers — never decimals.
- Every Route Handler keeps `export const runtime = 'nodejs'`.
- `spendCredits` / `grantCredits` (`frontend/src/lib/server/credits/ledger.ts`) are the only credit-balance mutation choke points — never write `creditBalance` or `CreditTransaction` directly outside them.
- No file from CLAUDE.md's protected list is touched by this plan: not `auth.ts`, not `oauth/google.ts` or its route handlers, not `middleware/index.ts`, not `webhook/handler.ts`, not `admin/audit.ts`. `credits/ledger.ts` is NOT on that list and may be edited.
- `GET /api/referral/me` intentionally does **not** call `verifyCsrf` — it mirrors the existing `GET /api/affiliate/me` precedent (also CSRF-exempt despite reading affiliate data). Its only side effect, generating a fresh code for the caller's own account the first time, cannot be steered or read back by a cross-origin forger (same-origin policy blocks reading the JSON response), so there is no meaningful CSRF attack surface. This is a settled decision for this plan, not something to re-litigate per task.
- `ReferralBonus` is the sole source of truth for both the monthly cap count and duplicate-prevention (a full unique constraint on `referredUserId`, not a partial index — this table only ever holds one kind of row, unlike `AffiliateEarning`).
- Points earned per verified referral: **10**. Conversion threshold: **100 points = 1 credit**, automatic. Monthly cap: **10** rewarded referrals per referrer per calendar month (UTC).

---

### Task 1: Schema — `referralPoints`, `ReferralBonus`, migration

**Files:**
- Modify: `frontend/prisma/schema.prisma:11-112` (User model), `frontend/prisma/schema.prisma:189-207` (near AffiliateEarning — new model goes right after it), `frontend/prisma/schema.prisma:742-759` (CreditTransaction doc-comment)
- Create: `frontend/prisma/migrations/20260831120000_referral_points_program/migration.sql`

**Interfaces:**
- Produces: `User.referralPoints: number` (Prisma field), `ReferralBonus` model with fields `id, referrerId, referredUserId (unique), points, createdAt` and relations `referrer`/`referredUser`, `CreditTransaction.type` now documented to also accept `'REFERRAL_CONVERSION'` (still a plain `String` column, no enum, no schema change needed for the value itself — see Task 3).

- [ ] **Step 1: Add `referralPoints` and the two `ReferralBonus` relation fields to `User`**

In `frontend/prisma/schema.prisma`, find this block (currently lines 96-105):

```prisma
  // Filleul → parrain. Set exactly once, at signup (POST /api/auth/signup),
  // never modified afterward — permanent attribution. onDelete: SetNull so
  // a (hypothetical, not built in V1) affiliate-account deletion never
  // cascades into deleting the referred user.
  referredByAffiliateId String?
  referredByAffiliate   User?   @relation("AffiliateReferrals", fields: [referredByAffiliateId], references: [id], onDelete: SetNull)
  referredUsers         User[]  @relation("AffiliateReferrals")

  affiliateEarnings AffiliateEarning[] @relation("AffiliateEarnings")
  earningsGenerated AffiliateEarning[] @relation("ReferredUserEarnings")

  @@index([email])
```

Replace it with (adds `referralPoints` and the two new relation fields right after `earningsGenerated`, before the index block):

```prisma
  // Filleul → parrain. Set exactly once, at signup (POST /api/auth/signup),
  // never modified afterward — permanent attribution. onDelete: SetNull so
  // a (hypothetical, not built in V1) affiliate-account deletion never
  // cascades into deleting the referred user.
  referredByAffiliateId String?
  referredByAffiliate   User?   @relation("AffiliateReferrals", fields: [referredByAffiliateId], references: [id], onDelete: SetNull)
  referredUsers         User[]  @relation("AffiliateReferrals")

  affiliateEarnings AffiliateEarning[] @relation("AffiliateEarnings")
  earningsGenerated AffiliateEarning[] @relation("ReferredUserEarnings")

  // Peer-to-peer referral program (2026-08-31) — every regular user can
  // refer other regular users through the same affiliateCode/promoCode
  // mechanism as the AFFILIATE cash program above, but earns points
  // instead of FCFA. Incremented by ReferralBonus rows (10 points per
  // verified referral) and drained automatically into
  // CreditTransaction(type=REFERRAL_CONVERSION) every time it crosses a
  // 100-point threshold. See POST /api/admin/verification-queue/[id]/process
  // and lib/server/referrals/points.ts for the constants.
  referralPoints Int @default(0)

  referralBonusesGiven    ReferralBonus[] @relation("ReferralBonusesGiven")
  referralBonusesReceived ReferralBonus[] @relation("ReferralBonusesReceived")

  @@index([email])
```

- [ ] **Step 2: Add the `ReferralBonus` model**

In `frontend/prisma/schema.prisma`, find the end of the `AffiliateEarning` model (currently ends at line 207 with a closing `}` followed by a `// ───` divider comment before `AdminTwoFactorChallenge`). Insert the new model right after `AffiliateEarning`'s closing `}` and before that divider:

```prisma
// One row per successfully rewarded peer-to-peer referral (2026-08-31).
// referredUserId is unique — a given referred account can trigger this
// bonus at most once, ever, enforced at the database level (a full unique
// constraint, not a partial index like AffiliateEarning's, since this
// table only ever holds this one kind of row). Also the source of truth
// for the monthly cap: count rows for a referrer created since the start
// of the current calendar month. Rows are inserted by
// POST /api/admin/verification-queue/[id]/process; point/cap constants
// live in lib/server/referrals/points.ts.
model ReferralBonus {
  id             String   @id @default(cuid())
  referrerId     String
  referrer       User     @relation("ReferralBonusesGiven", fields: [referrerId], references: [id], onDelete: Cascade)
  referredUserId String   @unique
  referredUser   User     @relation("ReferralBonusesReceived", fields: [referredUserId], references: [id], onDelete: Cascade)
  points         Int
  createdAt      DateTime @default(now())

  @@index([referrerId, createdAt])
}
```

- [ ] **Step 3: Document the new `CreditTransaction.type` value**

In `frontend/prisma/schema.prisma`, find:

```prisma
  type           String   // PURCHASE | SPEND | ADMIN_GRANT | WELCOME_GIFT
```

Replace with:

```prisma
  type           String   // PURCHASE | SPEND | ADMIN_GRANT | WELCOME_GIFT | REFERRAL_CONVERSION
```

- [ ] **Step 4: Write the migration by hand**

No TTY is available in this environment for `prisma migrate dev`, so hand-write the migration folder (same workaround used for every prior migration this session).

Create `frontend/prisma/migrations/20260831120000_referral_points_program/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "referralPoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
COMMENT ON COLUMN "CreditTransaction"."type" IS 'PURCHASE | SPEND | ADMIN_GRANT | WELCOME_GIFT | REFERRAL_CONVERSION';

-- CreateTable
CREATE TABLE "ReferralBonus" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralBonus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralBonus_referredUserId_key" ON "ReferralBonus"("referredUserId");

-- CreateIndex
CREATE INDEX "ReferralBonus_referrerId_createdAt_idx" ON "ReferralBonus"("referrerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReferralBonus" ADD CONSTRAINT "ReferralBonus_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralBonus" ADD CONSTRAINT "ReferralBonus_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Note: the `COMMENT ON COLUMN` statement is optional decoration (Postgres column comments aren't read by Prisma at runtime) — include it anyway since it keeps the deployed database's introspection output matching the schema.prisma doc-comment. If it causes any issue, it is safe to drop that one statement without affecting the rest of the migration.

- [ ] **Step 5: Apply the migration and regenerate the Prisma client**

Run:
```
pnpm db:migrate:deploy
pnpm --filter frontend exec prisma generate
```
Expected: `1 migration found`, `Applying migration 20260831120000_referral_points_program`, then `The migration has been applied`, then Prisma Client regenerated successfully (`migrate deploy` does not regenerate the client on its own — the explicit `prisma generate` is required so TypeScript sees `prisma.referralBonus` and `User.referralPoints`).

- [ ] **Step 6: Verify with typecheck**

Run: `pnpm typecheck`
Expected: no errors. This confirms the regenerated Prisma Client's types (`prisma.referralBonus`, `User.referralPoints`) are visible to TypeScript before any application code references them.

- [ ] **Step 7: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/20260831120000_referral_points_program
git commit -m "feat(db): add referralPoints and ReferralBonus for the peer referral program"
```

---

### Task 2: Signup — accept a promoCode from any user, not just AFFILIATE

**Files:**
- Modify: `frontend/src/app/api/auth/signup/route.ts:136-148`
- Test: `frontend/src/app/api/auth/signup/route.test.ts:237-259`

**Interfaces:**
- Consumes: nothing new from Task 1 (this task only touches the promo-lookup query's `select`, unrelated to the new fields).
- Produces: `referredByAffiliateId` can now be set to ANY existing user's id, not only an AFFILIATE-role user's — Task 3 depends on this (a regular-user referrer must be reachable via `profile.user.referredByAffiliateId`).

- [ ] **Step 1: Remove the role restriction**

In `frontend/src/app/api/auth/signup/route.ts`, find (lines 136-148):

```ts
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
```

Replace with:

```ts
    // Resolve the referring user BEFORE the transaction — a bad/unknown
    // code must NEVER block or error signup, so this is a plain best-effort
    // lookup, not a guard. Any account with an affiliateCode can refer
    // (2026-08-31 — previously AFFILIATE-role only). What the referrer
    // earns for it depends on their role, decided later at verification
    // time — see POST /api/admin/verification-queue/[id]/process.
    let referredByAffiliateId: string | undefined;
    if (promoCode) {
      const referrer = await prisma.user.findUnique({
        where: { affiliateCode: promoCode.toUpperCase() },
        select: { id: true },
      });
      if (referrer) {
        referredByAffiliateId = referrer.id;
      }
    }
```

- [ ] **Step 2: Update the test that now has the wrong expectation**

In `frontend/src/app/api/auth/signup/route.test.ts`, find the test `'ignores a code that resolves to a non-AFFILIATE user'` (lines 237-259):

```ts
  it('ignores a code that resolves to a non-AFFILIATE user', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'someone', role: 'USER' } as never);
    prismaMock.user.create.mockResolvedValue({ id: 'new_user_3' } as never);
    prismaMock.verificationCode.create.mockResolvedValue({} as never);
    prismaMock.user.update.mockResolvedValue({ creditBalance: 5 } as never);
    prismaMock.creditTransaction.create.mockResolvedValue({} as never);

    const res = await POST(
      makeReq({
        email: 'noref2@test.local',
        password: 'a-strong-enough-password',
        promoCode: 'NOTANAFF',
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ referredByAffiliateId: expect.anything() }),
      }),
    );
  });
```

Replace it with (the behavior flips — a non-AFFILIATE user's code now DOES resolve):

```ts
  it('sets referredByAffiliateId when promoCode matches a regular (non-AFFILIATE) user', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'someone' } as never);
    prismaMock.user.create.mockResolvedValue({ id: 'new_user_3' } as never);
    prismaMock.verificationCode.create.mockResolvedValue({} as never);
    prismaMock.user.update.mockResolvedValue({ creditBalance: 5 } as never);
    prismaMock.creditTransaction.create.mockResolvedValue({} as never);

    const res = await POST(
      makeReq({
        email: 'noref2@test.local',
        password: 'a-strong-enough-password',
        promoCode: 'REGULARUSER',
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ referredByAffiliateId: 'someone' }),
      }),
    );
  });
```

- [ ] **Step 3: Run the signup test file**

Run: `pnpm --filter frontend exec vitest run src/app/api/auth/signup/route.test.ts`
Expected: all tests pass, including the renamed test and the untouched `'sets referredByAffiliateId when promoCode matches an AFFILIATE account'` test (still passes unmodified — an AFFILIATE account also just has an `id`, so it still resolves under the simplified `select: { id: true }`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/api/auth/signup/route.ts frontend/src/app/api/auth/signup/route.test.ts
git commit -m "feat(referral): let a promoCode from any user resolve at signup, not just AFFILIATE"
```

---

### Task 3: Verification-queue — branch the bonus by referrer role

This is the core task: the existing AFFILIATE cash-bonus branch stays byte-for-byte behaviorally identical; a new points branch is added beside it, mutually exclusive.

**Files:**
- Create: `frontend/src/lib/server/referrals/points.ts`
- Modify: `frontend/src/lib/server/credits/ledger.ts:93-99` (`GrantInput['type']` union)
- Modify: `frontend/src/app/api/admin/verification-queue/[id]/process/route.ts:1-18` (imports), `:79-112` (bonus block)
- Test: `frontend/src/app/api/admin/verification-queue/[id]/process/route.test.ts` (4 existing tests need a new mock added; 4 new tests added)

**Interfaces:**
- Consumes: `ReferralBonus` model and `User.referralPoints` from Task 1; `referredByAffiliateId` now possibly pointing at a non-AFFILIATE user, from Task 2.
- Produces: `REFERRAL_POINTS_PER_VERIFICATION`, `REFERRAL_POINTS_PER_CREDIT`, `REFERRAL_MONTHLY_CAP` (exported from the new `points.ts`) — Task 4's `GET /api/referral/me` imports `REFERRAL_POINTS_PER_CREDIT` from the same file. `grantCredits`'s `GrantInput['type']` now accepts `'REFERRAL_CONVERSION'`.

- [ ] **Step 0: Add `'REFERRAL_CONVERSION'` to `ledger.ts`'s type union**

In `frontend/src/lib/server/credits/ledger.ts`, find:

```ts
export interface GrantInput {
  userId: string;
  amount: number;
  type: 'PURCHASE' | 'ADMIN_GRANT' | 'WELCOME_GIFT';
  action: string;
  relatedOrderId?: string;
}
```

Replace with:

```ts
export interface GrantInput {
  userId: string;
  amount: number;
  type: 'PURCHASE' | 'ADMIN_GRANT' | 'WELCOME_GIFT' | 'REFERRAL_CONVERSION';
  action: string;
  relatedOrderId?: string;
}
```

Without this change, Step 3 below's `grantCredits(tx, { type: 'REFERRAL_CONVERSION', ... })` call fails `pnpm typecheck` — `'REFERRAL_CONVERSION'` would not be assignable to `GrantInput['type']`.

- [ ] **Step 1: Create the constants file**

Create `frontend/src/lib/server/referrals/points.ts`:

```ts
// Central place for the peer-to-peer referral program's point economy
// (2026-08-31) — the only file that should ever hard-code these numbers.
// Consumed by POST /api/admin/verification-queue/[id]/process (where
// points are earned and auto-converted) and GET /api/referral/me (where a
// user's progress toward their next credit is displayed).
import 'server-only';

/** Points a referrer earns when their referred account passes verification. */
export const REFERRAL_POINTS_PER_VERIFICATION = 10;

/** Points that convert into exactly 1 credit, automatically, once reached. */
export const REFERRAL_POINTS_PER_CREDIT = 100;

/**
 * Max verified referrals that earn points for one referrer per calendar
 * month (UTC). Beyond this, a verified referral earns nothing — silent,
 * not an error.
 */
export const REFERRAL_MONTHLY_CAP = 10;
```

- [ ] **Step 2: Add the new imports to the route**

In `frontend/src/app/api/admin/verification-queue/[id]/process/route.ts`, find:

```ts
import { createNotification } from '@/lib/server/notifications';
import { profileRejected, profileVerified } from '@/lib/server/notifications/templates';
```

Replace with:

```ts
import { createNotification } from '@/lib/server/notifications';
import { profileRejected, profileVerified } from '@/lib/server/notifications/templates';
import { grantCredits } from '@/lib/server/credits/ledger';
import {
  REFERRAL_MONTHLY_CAP,
  REFERRAL_POINTS_PER_CREDIT,
  REFERRAL_POINTS_PER_VERIFICATION,
} from '@/lib/server/referrals/points';
```

- [ ] **Step 3: Replace the bonus block**

In the same file, find the entire block (currently lines 79-112):

```ts
      // Affiliate verification bonus — approve-only, and only when this
      // profile's account was referred. Never runs on REJECT.
      if (approve && profile.user.referredByAffiliateId) {
        const existingBonus = await tx.affiliateEarning.findFirst({
          where: { referredUserId: profile.userId, type: 'VERIFICATION_BONUS' },
          select: { id: true },
        });
        if (!existingBonus) {
          // Postgres partial-unique-index failsafe (see migration
          // "AffiliateEarning_one_verification_bonus_per_user") — a
          // concurrent request may have already inserted the bonus between
          // our findFirst above and this insert. A unique-constraint
          // violation on Postgres aborts the WHOLE transaction (25P02),
          // which a JS try/catch around `.create()` cannot undo inside an
          // interactive Prisma transaction (no savepoints between
          // statements) — the next statement (logAdminAction below) would
          // itself throw and roll back the profile's legitimate
          // verification too. `createMany({ skipDuplicates: true })`
          // compiles to `INSERT ... ON CONFLICT DO NOTHING`, so it never
          // raises on the partial-unique-index conflict and no catch is
          // needed.
          await tx.affiliateEarning.createMany({
            data: [
              {
                affiliateId: profile.user.referredByAffiliateId,
                referredUserId: profile.userId,
                type: 'VERIFICATION_BONUS',
                amount: profile.gender === 'FEMME' ? 90 : 30,
              },
            ],
            skipDuplicates: true,
          });
        }
      }
```

Replace with:

```ts
      // Referral verification bonus — approve-only, and only when this
      // profile's account was referred. Never runs on REJECT. Branches by
      // the referrer's role (2026-08-31): an AFFILIATE-role referrer keeps
      // earning real FCFA (unchanged cash program below); any other
      // referrer — a regular user who shared their own link — earns
      // REFERRAL_POINTS_PER_VERIFICATION points instead, capped at
      // REFERRAL_MONTHLY_CAP rewarded referrals per calendar month. The two
      // paths are mutually exclusive — never both for the same event.
      if (approve && profile.user.referredByAffiliateId) {
        const referrer = await tx.user.findUnique({
          where: { id: profile.user.referredByAffiliateId },
          select: { id: true, role: true },
        });

        if (referrer?.role === 'AFFILIATE') {
          const existingBonus = await tx.affiliateEarning.findFirst({
            where: { referredUserId: profile.userId, type: 'VERIFICATION_BONUS' },
            select: { id: true },
          });
          if (!existingBonus) {
            // Postgres partial-unique-index failsafe (see migration
            // "AffiliateEarning_one_verification_bonus_per_user") — a
            // concurrent request may have already inserted the bonus
            // between our findFirst above and this insert. A
            // unique-constraint violation on Postgres aborts the WHOLE
            // transaction (25P02), which a JS try/catch around `.create()`
            // cannot undo inside an interactive Prisma transaction (no
            // savepoints between statements) — the next statement
            // (logAdminAction below) would itself throw and roll back the
            // profile's legitimate verification too.
            // `createMany({ skipDuplicates: true })` compiles to
            // `INSERT ... ON CONFLICT DO NOTHING`, so it never raises on
            // the partial-unique-index conflict and no catch is needed.
            await tx.affiliateEarning.createMany({
              data: [
                {
                  affiliateId: referrer.id,
                  referredUserId: profile.userId,
                  type: 'VERIFICATION_BONUS',
                  amount: profile.gender === 'FEMME' ? 90 : 30,
                },
              ],
              skipDuplicates: true,
            });
          }
        } else if (referrer) {
          const monthStart = new Date(
            Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
          );
          const bonusesThisMonth = await tx.referralBonus.count({
            where: { referrerId: referrer.id, createdAt: { gte: monthStart } },
          });
          if (bonusesThisMonth < REFERRAL_MONTHLY_CAP) {
            // Same skipDuplicates rationale as the AFFILIATE branch above —
            // ReferralBonus.referredUserId carries a full unique
            // constraint, so a concurrent duplicate resolves as count: 0
            // instead of throwing.
            const inserted = await tx.referralBonus.createMany({
              data: [
                {
                  referrerId: referrer.id,
                  referredUserId: profile.userId,
                  points: REFERRAL_POINTS_PER_VERIFICATION,
                },
              ],
              skipDuplicates: true,
            });
            if (inserted.count === 1) {
              const updated = await tx.user.update({
                where: { id: referrer.id },
                data: { referralPoints: { increment: REFERRAL_POINTS_PER_VERIFICATION } },
                select: { referralPoints: true },
              });
              const creditsToGrant = Math.floor(
                updated.referralPoints / REFERRAL_POINTS_PER_CREDIT,
              );
              if (creditsToGrant > 0) {
                await tx.user.update({
                  where: { id: referrer.id },
                  data: { referralPoints: updated.referralPoints % REFERRAL_POINTS_PER_CREDIT },
                });
                await grantCredits(tx, {
                  userId: referrer.id,
                  amount: creditsToGrant,
                  type: 'REFERRAL_CONVERSION',
                  action: 'referral_points_conversion',
                });
              }
            }
          }
        }
      }
```

- [ ] **Step 4: Fix the 4 existing tests that now need a referrer-role mock**

In `frontend/src/app/api/admin/verification-queue/[id]/process/route.test.ts`, the route now does one extra `tx.user.findUnique` lookup (for the referrer's role) whenever `referredByAffiliateId` is set — every existing test that sets it must now mock that call, or `referrer` resolves to `undefined` and the whole bonus block silently no-ops.

Find `'POST inserts a 30 FCFA VERIFICATION_BONUS for a referred HOMME on approve'` and add one line before the `affiliateEarning.findFirst` mock:

```ts
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce(null);
```

becomes:

```ts
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'aff_1', role: 'AFFILIATE' } as never);
    prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce(null);
```

Apply the exact same one-line addition (`prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'aff_1', role: 'AFFILIATE' } as never);` immediately before the existing `affiliateEarning.findFirst` mock) to these 3 other tests too:
- `'POST inserts a 90 FCFA VERIFICATION_BONUS for a referred FEMME on approve'`
- `'POST never inserts a second bonus for the same referredUserId (app-level check)'`
- `'POST uses createMany+skipDuplicates so a concurrent duplicate bonus never aborts the transaction'`

Do **not** modify `'POST never inserts a bonus when the profile has no referring affiliate'` or `'POST never inserts a bonus on REJECT even with a referring affiliate'` — in both, the outer `if (approve && referredByAffiliateId)` condition is false, so the referrer lookup is never reached; these should keep passing unmodified.

- [ ] **Step 5: Add the 4 new tests for the points path**

Add this new `describe` block at the end of the file, before the final closing of the outer `describe`:

```ts
  describe('peer referral points (non-AFFILIATE referrer)', () => {
    it('awards 10 points and does not convert when under the 100-point threshold', async () => {
      const profile = seedProfile({ id: 'p_points_1', referredByAffiliateId: 'ref_1' });
      prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
      prismaMock.profile.update.mockResolvedValueOnce({
        ...profile,
        verificationStatus: 'VERIFIED',
      } as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'ref_1', role: 'USER' } as never);
      prismaMock.referralBonus.count.mockResolvedValueOnce(3);
      prismaMock.referralBonus.createMany.mockResolvedValueOnce({ count: 1 } as never);
      prismaMock.user.update.mockResolvedValueOnce({ referralPoints: 30 } as never);

      const res = await POST(makePost('p_points_1', { action: 'APPROVE' }), ctxWith('p_points_1'));
      expect(res.status).toBe(200);
      expect(prismaMock.referralBonus.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [{ referrerId: 'ref_1', referredUserId: 'user_1', points: 10 }],
          skipDuplicates: true,
        }),
      );
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'ref_1' },
        data: { referralPoints: { increment: 10 } },
        select: { referralPoints: true },
      });
      // Under 100 points (30) — no conversion, so no second user.update and
      // no credit transaction.
      expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.creditTransaction.create).not.toHaveBeenCalled();
    });

    it('auto-converts to credits when the 100-point threshold is crossed', async () => {
      const profile = seedProfile({ id: 'p_points_2', referredByAffiliateId: 'ref_2' });
      prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
      prismaMock.profile.update.mockResolvedValueOnce({
        ...profile,
        verificationStatus: 'VERIFIED',
      } as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'ref_2', role: 'USER' } as never);
      prismaMock.referralBonus.count.mockResolvedValueOnce(0);
      prismaMock.referralBonus.createMany.mockResolvedValueOnce({ count: 1 } as never);
      // Balance was 95, +10 crosses to 105 — 1 credit granted, remainder 5.
      prismaMock.user.update
        .mockResolvedValueOnce({ referralPoints: 105 } as never) // increment
        .mockResolvedValueOnce({ referralPoints: 5 } as never) // remainder write
        .mockResolvedValueOnce({ creditBalance: 6 } as never); // grantCredits' own update
      prismaMock.creditTransaction.create.mockResolvedValueOnce({} as never);

      const res = await POST(makePost('p_points_2', { action: 'APPROVE' }), ctxWith('p_points_2'));
      expect(res.status).toBe(200);
      expect(prismaMock.user.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'ref_2' },
        data: { referralPoints: 5 },
      });
      expect(prismaMock.creditTransaction.create).toHaveBeenCalledWith({
        data: {
          userId: 'ref_2',
          type: 'REFERRAL_CONVERSION',
          amount: 1,
          action: 'referral_points_conversion',
          relatedOrderId: null,
        },
      });
    });

    it('awards nothing once the referrer already has 10 bonuses this month', async () => {
      const profile = seedProfile({ id: 'p_points_3', referredByAffiliateId: 'ref_3' });
      prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
      prismaMock.profile.update.mockResolvedValueOnce({
        ...profile,
        verificationStatus: 'VERIFIED',
      } as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'ref_3', role: 'USER' } as never);
      prismaMock.referralBonus.count.mockResolvedValueOnce(10);

      const res = await POST(makePost('p_points_3', { action: 'APPROVE' }), ctxWith('p_points_3'));
      expect(res.status).toBe(200);
      expect(prismaMock.referralBonus.createMany).not.toHaveBeenCalled();
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('never touches the points path for an AFFILIATE-role referrer (mutual exclusivity)', async () => {
      const profile = seedProfile({ id: 'p_points_4', referredByAffiliateId: 'aff_1' });
      prismaMock.profile.findUnique.mockResolvedValueOnce(profile as never);
      prismaMock.profile.update.mockResolvedValueOnce({
        ...profile,
        verificationStatus: 'VERIFIED',
      } as never);
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: 'aff_1', role: 'AFFILIATE' } as never);
      prismaMock.affiliateEarning.findFirst.mockResolvedValueOnce(null);
      prismaMock.affiliateEarning.createMany.mockResolvedValueOnce({ count: 1 } as never);

      await POST(makePost('p_points_4', { action: 'APPROVE' }), ctxWith('p_points_4'));
      expect(prismaMock.referralBonus.count).not.toHaveBeenCalled();
      expect(prismaMock.referralBonus.createMany).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 6: Run the full test file**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/verification-queue/[id]/process/route.test.ts`
Expected: all tests pass (the 4 updated existing tests + the 4 new ones + everything untouched).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/server/credits/ledger.ts frontend/src/lib/server/referrals/points.ts frontend/src/app/api/admin/verification-queue/[id]/process/route.ts frontend/src/app/api/admin/verification-queue/[id]/process/route.test.ts
git commit -m "feat(referral): award points to non-AFFILIATE referrers on verification, auto-convert at 100"
```

---

### Task 4: `GET /api/referral/me`

**Files:**
- Create: `frontend/src/app/api/referral/me/route.ts`
- Test: `frontend/src/app/api/referral/me/route.test.ts`

**Interfaces:**
- Consumes: `REFERRAL_POINTS_PER_CREDIT` from `frontend/src/lib/server/referrals/points.ts` (Task 3); `generateUniqueAffiliateCode()` from `frontend/src/lib/server/affiliates/code.ts` (existing, unmodified).
- Produces: `GET /api/referral/me` → `{ affiliateCode: string; referralPoints: number; pointsPerCredit: number; referralUrl: string }`. Task 5's frontend section consumes this shape.

- [ ] **Step 1: Write the route**

Create `frontend/src/app/api/referral/me/route.ts`:

```ts
// GET /api/referral/me — a regular user's own referral code, share link,
// and points progress. Lazily generates affiliateCode on first call: this
// user may have signed up before this feature existed, or via Google
// OAuth, which never assigns one at account-creation time (that callback
// route is CLAUDE.md-protected, so this plan deliberately never touches
// it — see docs/superpowers/specs/2026-08-31-referral-points-program-design.md §5.1).
//
// No CSRF check: this GET's only side effect (assigning a fresh random
// code to the caller's own account, the first time only) has no
// cross-site attack surface — a forged cross-origin request can neither
// choose the resulting code nor read the JSON response back (same-origin
// policy). Same reasoning already applied to GET /api/affiliate/me.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { generateUniqueAffiliateCode } from '@/lib/server/affiliates/code';
import { REFERRAL_POINTS_PER_CREDIT } from '@/lib/server/referrals/points';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const userId = auth.user.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { affiliateCode: true, referralPoints: true },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let code = user.affiliateCode;
    if (!code) {
      code = await generateUniqueAffiliateCode();
      await prisma.user.update({ where: { id: userId }, data: { affiliateCode: code } });
    }

    return NextResponse.json(
      {
        affiliateCode: code,
        referralPoints: user.referralPoints,
        pointsPerCredit: REFERRAL_POINTS_PER_CREDIT,
        referralUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/onboarding?promo=${code}`,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 2: Write the failing tests first**

Create `frontend/src/app/api/referral/me/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/affiliates/code', () => ({
  generateUniqueAffiliateCode: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { generateUniqueAffiliateCode } from '@/lib/server/affiliates/code';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGenerateCode = vi.mocked(generateUniqueAffiliateCode);

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/referral/me', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({
    user: { sub: 'user_1', email: 'user@test.local' },
  } as never);
});

describe('GET /api/referral/me', () => {
  it('returns the existing code and points without generating a new one', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      affiliateCode: 'EXISTING1',
      referralPoints: 40,
    } as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      affiliateCode: 'EXISTING1',
      referralPoints: 40,
      pointsPerCredit: 100,
      referralUrl: 'http://localhost:3000/onboarding?promo=EXISTING1',
    });
    expect(mockGenerateCode).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('lazily generates and persists a code on first call', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      affiliateCode: null,
      referralPoints: 0,
    } as never);
    mockGenerateCode.mockResolvedValueOnce('FRESHCODE');
    prismaMock.user.update.mockResolvedValueOnce({} as never);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.affiliateCode).toBe('FRESHCODE');
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { affiliateCode: 'FRESHCODE' },
    });
  });

  it('returns 404 USER_NOT_FOUND if the authenticated user no longer exists', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('USER_NOT_FOUND');
  });

  it('propagates a 401 from requireAuth without touching Prisma', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("source exports runtime = 'nodejs' (Phase 0 guard)", async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
  });
});
```

- [ ] **Step 3: Run the test file**

Run: `pnpm --filter frontend exec vitest run src/app/api/referral/me/route.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/api/referral/me/route.ts frontend/src/app/api/referral/me/route.test.ts
git commit -m "feat(referral): add GET /api/referral/me with lazy code generation"
```

---

### Task 5: Frontend — "Parrainage" section on the Paiement settings page

No automated test coverage for this task (page component) — manual verification only, per the spec.

**Files:**
- Modify: `frontend/src/app/app/parametres/paiement/page.tsx`

**Interfaces:**
- Consumes: `GET /api/referral/me` → `{ affiliateCode, referralPoints, pointsPerCredit, referralUrl }` (Task 4).

- [ ] **Step 1: Add the referral state and fetch**

In `frontend/src/app/app/parametres/paiement/page.tsx`, find:

```ts
interface CreditTransactionRow {
  id: string;
  type: 'PURCHASE' | 'SPEND' | 'ADMIN_GRANT' | 'WELCOME_GIFT';
  amount: number;
  action: string;
  createdAt: string;
}
```

Replace with (widen the type union and add the new interface right after it):

```ts
interface CreditTransactionRow {
  id: string;
  type: 'PURCHASE' | 'SPEND' | 'ADMIN_GRANT' | 'WELCOME_GIFT' | 'REFERRAL_CONVERSION';
  amount: number;
  action: string;
  createdAt: string;
}

interface ReferralInfo {
  affiliateCode: string;
  referralPoints: number;
  pointsPerCredit: number;
  referralUrl: string;
}
```

Find:

```ts
const ACTION_LABELS: Record<string, string> = {
  view_visitors: 'Voir qui a visité ton profil',
  view_favorited_by: "Voir qui t'a mis en favori",
  boost: 'Boost de visibilité (24h)',
  first_message: 'Premier message envoyé',
  admin_grant: 'Ajustement par YeOyo',
  welcome_gift: 'Cadeau de bienvenue',
};
```

Replace with (one new label so a REFERRAL_CONVERSION row reads clearly in the existing history list):

```ts
const ACTION_LABELS: Record<string, string> = {
  view_visitors: 'Voir qui a visité ton profil',
  view_favorited_by: "Voir qui t'a mis en favori",
  boost: 'Boost de visibilité (24h)',
  first_message: 'Premier message envoyé',
  admin_grant: 'Ajustement par YeOyo',
  welcome_gift: 'Cadeau de bienvenue',
  referral_points_conversion: 'Points de parrainage convertis',
};
```

Find:

```ts
export default function PaiementPage() {
  const user = useUser();
  const { balance, unlimited } = useCredits();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [creditTx, setCreditTx] = useState<CreditTransactionRow[]>([]);
  const [creditTxLoaded, setCreditTxLoaded] = useState(false);
  const [creditTxCursor, setCreditTxCursor] = useState<string | null>(null);
  const [creditTxLoadingMore, setCreditTxLoadingMore] = useState(false);
```

Replace with (adds referral state and a mount effect right after the existing state declarations):

```ts
export default function PaiementPage() {
  const user = useUser();
  const { balance, unlimited } = useCredits();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [creditTx, setCreditTx] = useState<CreditTransactionRow[]>([]);
  const [creditTxLoaded, setCreditTxLoaded] = useState(false);
  const [creditTxCursor, setCreditTxCursor] = useState<string | null>(null);
  const [creditTxLoadingMore, setCreditTxLoadingMore] = useState(false);
  const [referral, setReferral] = useState<ReferralInfo | null>(null);

  useEffect(() => {
    api<ReferralInfo>('/api/referral/me')
      .then(setReferral)
      .catch(() => undefined); // non-critical — section just stays hidden
  }, []);

  async function copyReferralLink() {
    if (!referral) return;
    try {
      await navigator.clipboard.writeText(referral.referralUrl);
      toast('Lien copié !', 'success');
    } catch {
      toast('Impossible de copier le lien', 'error');
    }
  }
```

- [ ] **Step 2: Add the `useEffect` import**

Find:

```ts
import { useCallback, useState } from 'react';
```

Replace with:

```ts
import { useCallback, useEffect, useState } from 'react';
```

- [ ] **Step 3: Render the new section**

Find the closing of the existing `<SettingsSection title="Paiement">` block:

```tsx
            </div>
          </details>
        </SettingsSection>
      </div>
    </AppShell>
  );
}
```

Replace with (adds a second, sibling `SettingsSection` right after the first one closes):

```tsx
            </div>
          </details>
        </SettingsSection>

        {referral && (
          <SettingsSection
            title="Parrainage"
            description="Invite tes proches — chaque compte vérifié te rapporte des points, convertis automatiquement en crédits."
          >
            <SettingsRow label="Ton code" helper={referral.affiliateCode}>
              <button
                type="button"
                onClick={() => void copyReferralLink()}
                className="btn-premium rounded-lg px-4 py-2 font-body text-sm font-semibold"
              >
                Copier le lien
              </button>
            </SettingsRow>
            <div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/30">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, (referral.referralPoints / referral.pointsPerCredit) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-2 font-body text-xs text-muted-foreground">
                {referral.referralPoints}/{referral.pointsPerCredit} points — encore{' '}
                {referral.pointsPerCredit - referral.referralPoints} points pour ton prochain
                crédit.
              </p>
            </div>
          </SettingsSection>
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Manual verification**

Run `pnpm dev`, log in as a seeded user, navigate to `/app/parametres/paiement`. Confirm:
- The "Parrainage" section renders with a code and a progress bar/line.
- Clicking "Copier le lien" shows a success toast and the clipboard actually contains `.../onboarding?promo=<CODE>`.
- Reload the page — the same code is shown (not regenerated).
- The existing "Paiement" section (balance, payment history, credit history) still renders exactly as before.

- [ ] **Step 5: Run typecheck, lint, and the full test suite**

Run: `pnpm typecheck && pnpm lint && pnpm --filter frontend exec vitest run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/app/parametres/paiement/page.tsx
git commit -m "feat(referral): surface the Parrainage section on Paramètres > Paiement"
```

---

## Final Verification

- [ ] Run `pnpm format && pnpm lint && pnpm typecheck && pnpm test` from the repo root — all must pass (per CLAUDE.md's pre-commit checklist).
- [ ] Run `pnpm --filter frontend exec next build` — confirms the new route and page compile in production mode.
- [ ] Grep the diff for any of CLAUDE.md's protected files (`auth.ts`, `oauth/google`, `middleware/index.ts`, `webhook/handler.ts`, `admin/audit.ts`, `payments/circuit-breaker.ts`, `outbox/dispatcher.ts`, `observability/request-context.ts`, `instrumentation.ts`, `lib/api.ts`) — none should appear.
