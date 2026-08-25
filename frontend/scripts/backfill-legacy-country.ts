// One-off data backfill. Every Profile created before the 2026-08-25
// country/city onboarding step has country: null — and since Explorer/
// Découverte's same-country default now also has a mandatory country field
// in Paramètres, these legacy rows need a real value rather than staying
// permanently "incomplete". YeOyo's user base is RDC-first, so null is
// backfilled to 'CD' (see CLAUDE.md / lib/yeoyo/constants.ts COUNTRY_CODES).
//
// Usage: pnpm db:backfill-legacy-country
//
// Idempotent — only ever touches rows where country IS NULL, so running it
// twice (or against a DB that's already been backfilled) is a no-op.
import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';

const LEGACY_DEFAULT_COUNTRY = 'CD';

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

interface RunDeps {
  prisma?: Pick<PrismaClient, 'profile' | '$disconnect'>;
}

export async function main(deps: RunDeps = {}): Promise<number> {
  const prisma = deps.prisma ?? getPrisma();
  try {
    const before = await prisma.profile.count({ where: { country: null } });
    if (before === 0) {
      console.log('No legacy profiles with country: null — nothing to backfill.');
      return 0;
    }

    const result = await prisma.profile.updateMany({
      where: { country: null },
      data: { country: LEGACY_DEFAULT_COUNTRY },
    });

    console.log(
      `✓ Backfilled ${result.count} legacy profile(s) (country: null → ${LEGACY_DEFAULT_COUNTRY}).`,
    );
    return 0;
  } finally {
    if (!deps.prisma && prismaClient) {
      await prismaClient.$disconnect();
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
