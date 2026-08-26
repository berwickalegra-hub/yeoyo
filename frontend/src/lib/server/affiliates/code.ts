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
