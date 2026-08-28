// One-off data cleanup for the Message Flash branch (2026-08-27). Before
// this branch, POST /api/likes eagerly created a Conversation row on every
// like — this branch reverts that (a Conversation should only exist once a
// ContactRequest is ACCEPTED, or via a mutual-match auto-accept). Every
// Conversation row created by the old eager-upsert behaviour survives the
// deploy unless cleaned up, keeping the reverted behaviour effectively live
// for every user pair who used the app before this deploy (final whole-branch
// review finding C2).
//
// Scope, per an explicit product decision (not a code-correctness default):
// delete ONLY Conversation rows whose linked ContactRequest.status is not
// ACCEPTED (i.e. still PENDING, CANCELLED, or the unused VIEWED value) AND
// which have zero Message rows — no real conversation content is ever
// touched. A Conversation with >=1 messages but a non-ACCEPTED request is
// left alone (rare — would need its own product decision on whether to
// force-accept the request or keep as an exception) and only counted/logged
// for visibility.
//
// Usage: pnpm db:cleanup-legacy-conversations
//
// Idempotent — only ever deletes rows matching the criteria above, so
// running it twice (or against a DB already cleaned up) is a no-op.
import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

interface RunDeps {
  prisma?: Pick<PrismaClient, 'conversation' | '$disconnect'>;
}

export async function main(deps: RunDeps = {}): Promise<number> {
  const prisma = deps.prisma ?? getPrisma();
  try {
    const legacyRows = await prisma.conversation.findMany({
      where: { contactRequest: { status: { not: 'ACCEPTED' } } },
      select: { id: true, _count: { select: { messages: true } } },
    });

    if (legacyRows.length === 0) {
      console.log('No legacy Conversation rows with a non-ACCEPTED request — nothing to do.');
      return 0;
    }

    const emptyIds = legacyRows.filter((r) => r._count.messages === 0).map((r) => r.id);
    const nonEmptyCount = legacyRows.length - emptyIds.length;

    console.log(
      `Found ${legacyRows.length} legacy Conversation row(s) with a non-ACCEPTED request: ` +
        `${emptyIds.length} empty (will delete), ${nonEmptyCount} with real messages (left alone).`,
    );

    if (nonEmptyCount > 0) {
      console.log(
        `⚠ ${nonEmptyCount} legacy Conversation(s) have real message content but a ` +
          `non-ACCEPTED request — NOT deleted. These need a separate product decision ` +
          `(force-accept the request, or keep as a documented exception).`,
      );
    }

    if (emptyIds.length === 0) {
      console.log('Nothing empty to delete.');
      return 0;
    }

    const result = await prisma.conversation.deleteMany({ where: { id: { in: emptyIds } } });
    console.log(`✓ Deleted ${result.count} empty legacy Conversation row(s).`);
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
