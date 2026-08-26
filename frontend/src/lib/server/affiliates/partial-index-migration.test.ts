// Guards the hand-written Postgres PARTIAL unique index that Prisma cannot
// represent in schema.prisma (see the WARNING comment directly above the
// `AffiliateEarning` model). This is the only raw-SQL-beyond-generated
// statement across all migrations in this repo, so there is no existing
// migrations-testing convention to follow — this file establishes one.
//
// This test can only catch the migration.sql file being deleted or mangled
// on disk; it cannot (and, without a live DB, never could) catch a future
// `prisma migrate dev` generating a new migration that DROPs this index —
// that risk is what the schema.prisma doc comment is for.
//
// Placed under src/ (not prisma/migrations/) because vitest.config.ts's
// `include` glob only discovers `src/**/*.test.ts` and `scripts/**/*.test.ts`
// — a test file living under `frontend/prisma/` would silently never run.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATION_SQL_PATH = path.resolve(
  __dirname,
  '../../../../prisma/migrations/20260826073426_affiliate_program/migration.sql',
);

describe('AffiliateEarning partial unique index — migration.sql guard', () => {
  it('still contains the hand-written partial unique index for VERIFICATION_BONUS dedup', () => {
    const sql = readFileSync(MIGRATION_SQL_PATH, 'utf8');
    expect(sql).toContain('AffiliateEarning_one_verification_bonus_per_user');
  });
});
