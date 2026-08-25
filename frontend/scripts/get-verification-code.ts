// Local-dev convenience script. Prints the latest, still-valid verification
// code for an email — so you can test signup/reset flows without checking
// a real inbox (Resend is still the real delivery path; this just reads the
// same row from the DB the email itself was generated from).
//
// Usage: pnpm dev:verification-code <email> [EMAIL_VERIFY|PASSWORD_RESET]
//
// Read-only — never writes, never marks a code as used. Do not wire this
// into any route; it exists only as a CLI script run against your own
// .env-configured database.
import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

interface RunDeps {
  prisma?: Pick<PrismaClient, 'user' | 'verificationCode' | '$disconnect'>;
}

export async function main(
  args: string[] = process.argv.slice(2),
  deps: RunDeps = {},
): Promise<number> {
  const email = args[0]?.trim().toLowerCase();
  const type = args[1]?.trim().toUpperCase() || 'EMAIL_VERIFY';
  if (!email || !['EMAIL_VERIFY', 'PASSWORD_RESET'].includes(type)) {
    console.error('Usage: pnpm dev:verification-code <email> [EMAIL_VERIFY|PASSWORD_RESET]');
    return 1;
  }

  const prisma = deps.prisma ?? getPrisma();
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      console.log(`No user found for ${email}.`);
      return 1;
    }

    const code = await prisma.verificationCode.findFirst({
      where: { userId: user.id, type, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!code) {
      console.log(`No unused, unexpired ${type} code for ${email}.`);
      return 1;
    }

    console.log(`${code.code}  (expires ${code.expiresAt.toISOString()})`);
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
