// Bulk illustration seed — 50 well-filled FEMME profiles for manual UAT
// ("je vais vraiment tester l'application au complet", 2026-08-10). Separate
// script from seed-yeoyo-profiles.ts (which stays a small curated 9-fixture
// set) so a full test pass has enough real content in Explorer/Découvrir's
// grid, pagination, and filters without touching the existing fixture set.
//
// PHOTOS: deliberately NOT scraped from Google Images or any other source
// of real people's photos. Putting a real, non-consenting person's face on
// a fake dating profile — even a test one — is a privacy problem regardless
// of intent. Uses this project's own Banani design-export avatar bucket
// instead (same source as seed-yeoyo-profiles.ts — see that file's PHOTOS
// comment), bucketed by age so a profile only ever draws from its matching
// female/{25-35,35-50}/African folder. Switched from randomuser.me
// 2026-08-19 (user-reported blur — its portraits top out at 128x128 — and
// ethnic mismatch with the Congolese names). Each profile gets 1-3 photos
// (cycled from the matching 10-image bucket) to exercise the photo
// carousel. Names are drawn from generic first/last-name pools and paired
// deterministically — fictional combinations, not tied to any real
// identity, and decoupled from the (also generic/stock) photos.
//
// Usage: pnpm seed:yeoyo-women
//
// Idempotent — upserts keyed on email; safe to re-run. Refuses to run with
// NODE_ENV=production (same guard as seed-dev.ts / seed-yeoyo-profiles.ts).

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';

const FIXTURE_PASSWORD = 'YeoyoDemo123!';
const FIXTURE_EMAIL_PREFIX = 'yeoyo-women-';
const PROFILE_COUNT = 50;

const FIRST_NAMES = [
  'Espérance',
  'Chantal',
  'Belinda',
  'Aimée',
  'Pélagie',
  'Solange',
  'Yvette',
  'Francine',
  'Doreen',
  'Patricia',
  'Olive',
  'Ruth',
  'Vicky',
  'Annie',
  'Rachelle',
  'Béatrice',
  'Esther',
  'Judith',
  'Merveille',
  'Rachel',
  'Joyce',
  'Deborah',
  'Prisca',
  'Naomie',
  'Christelle',
  'Vanessa',
  'Gloria',
  'Rebecca',
  'Sarah',
  'Marie',
  'Josée',
  'Bijou',
  'Rosette',
  'Fifi',
  'Mimi',
  'Nadine',
  'Sylvie',
  'Carine',
  'Odette',
  'Jacky',
];

const LAST_NAMES = [
  'Kayembe',
  'Bope',
  'Lukusa',
  'Mavinga',
  'Kazadi',
  'Tshibangu',
  'Kabongo',
  'Ilunga',
  'Mutombo',
  'Kalala',
  'Ngoyi',
  'Muland',
  'Kanku',
  'Kasongo',
  'Mwamba',
  'Mukendi',
  'Ndaya',
  'Bakajika',
  'Ngalula',
  'Kabeya',
  'Kongolo',
  'Tshiala',
  'Mpoyi',
  'Kabasele',
];

const RELIGIONS = ['CHRETIEN', 'CATHOLIQUE', 'PROTESTANT', 'MUSULMAN'] as const;
const MARITAL_STATUSES = ['CELIBATAIRE', 'DIVORCE', 'VEUF_VEUVE'] as const;
const CHILDREN_COUNTS = ['0', '1', '2', '3+'] as const;
const WANTS_CHILDREN = ['OUI', 'NON', 'PEUT_ETRE'] as const;
const RELOCATE_OPEN = ['OUI', 'NON', 'A_DISCUTER'] as const;
const INTENTS = ['COURT_TERME', 'MOYEN_TERME', 'LONG_TERME'] as const;
const COMMUNES = [
  'Gombe',
  'Lemba',
  'Ngaliema',
  'Kalamu',
  'Bandalungwa',
  'Kintambo',
  'Limete',
  'Kasa-Vubu',
  'Ngiri-Ngiri',
  'Matete',
  'Ndjili',
  'Masina',
];

const JOBS = [
  'Infirmière',
  'Enseignante',
  'Commerçante',
  'Styliste',
  'Avocate',
  'Comptable',
  'Entrepreneuse',
  'Coiffeuse',
  'Journaliste',
  'Pharmacienne',
  'Architecte',
  'Banquière',
];

const BIOS = [
  "À la recherche d'une relation sérieuse fondée sur le respect et la foi.",
  'Simple, sincère et prête à construire une famille solide.',
  'Aime les soirées calmes, la bonne cuisine et les longues conversations.',
  "Croyante, famille avant tout. Je cherche quelqu'un de stable.",
  'Ambitieuse et déterminée, je cherche un partenaire pour avancer ensemble.',
  'Amoureuse de musique et de voyages, ouverte à une belle rencontre.',
  'Pas ici pour jouer — je cherche du sérieux et de la sincérité.',
  'Souriante, sociable, et fière de mes origines kinoises.',
  'La foi et la famille guident mes choix. À la recherche de la bonne personne.',
  'Douce mais déterminée, je sais ce que je veux dans la vie et dans le couple.',
];

const QUALITIES = [
  'Patiente, attentionnée, toujours prête à écouter.',
  "Déterminée, franche, et j'aime rire de tout.",
  'Fidèle, organisée, et très famille.',
  "Ambitieuse, généreuse, avec un grand sens de l'humour.",
];

const FLAWS = [
  "Un peu têtue quand j'ai une idée en tête.",
  'Parfois trop perfectionniste.',
  "J'ai du mal à faire confiance rapidement.",
  'Un peu impatiente, je travaille dessus.',
];

const DEALBREAKERS = [
  'Le manque de sincérité ou de respect.',
  "L'infidélité, sous aucune forme.",
  "Le manque d'ambition ou de sérieux.",
  'La violence, verbale ou physique.',
];

const INTERESTS_POOL = [
  'Musique',
  'Cuisine',
  'Voyages',
  'Lecture',
  'Danse',
  'Église',
  'Mode',
  'Cinéma',
];
const LANGUAGES_POOL = ['Français', 'Lingala', 'Swahili', 'Kikongo', 'Tshiluba'];

// 2026-08-19: switched off randomuser.me entirely (user-reported blur —
// its `med` tier is 72x72, and even its uncapped tier tops out at 128x128,
// visibly soft once upscaled into a several-hundred-px-wide card) and off
// randomuser.me's ethnically-mixed pool (user-reported mismatch — Congolese
// names paired with visibly non-African faces).
//
// Reuses this project's OWN existing photo source instead — the Banani
// design-export avatar bucket already wired into seed-yeoyo-profiles.ts
// (see that file's PHOTOS comment), which is explicitly tagged by ethnicity
// and age bracket and already vetted as fair to use for fixtures. Confirmed
// 10 stable images per `female/{25-35,35-50}/African/{0-9}` bucket, each
// 25-55KB (vs. randomuser's ~2KB) — a real quality jump, not just a resize.
// Bucketed by age so a 24-year-old profile never draws a 35-50 photo.
function portraitUrl(age: number, index: number): string {
  const bucket = age <= 35 ? '25-35' : '35-50';
  return `https://storage.googleapis.com/banani-avatars/avatar/female/${bucket}/African/${index % 10}`;
}

function pick<T>(pool: readonly T[], index: number): T {
  return pool[index % pool.length]!;
}

function pickMany<T>(pool: readonly T[], index: number, count: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(pool[(index + i) % pool.length]!);
  return [...new Set(out)];
}

function dateOfBirthForAge(age: number): Date {
  const now = new Date();
  return new Date(now.getFullYear() - age, (age * 7) % 12, 1 + ((age * 3) % 27));
}

// Converges a profile's ProfilePhoto rows to exactly `urls` (in order,
// first = primary) — safe to re-run after changing the pool or count.
// `FileUpload.key` is unique app-wide, so each slot gets a per-user suffix
// even though the underlying randomuser.me URL is reused across profiles.
async function ensurePhotos(
  prisma: PrismaClient,
  profileId: string,
  userId: string,
  urls: string[],
): Promise<void> {
  const existing = await prisma.profilePhoto.findMany({
    where: { profileId },
    orderBy: { order: 'asc' },
    include: { fileUpload: { select: { key: true } } },
  });
  const existingKeys = existing.map((p) => p.fileUpload.key);
  const targetKeys = urls.map((url, i) => `${url}#${userId}#${i}`);
  if (existingKeys.join('|') === targetKeys.join('|')) return;

  await prisma.profilePhoto.deleteMany({ where: { profileId } });
  for (let i = 0; i < urls.length; i++) {
    const key = targetKeys[i]!;
    const fileUpload = await prisma.fileUpload.upsert({
      where: { key },
      update: {},
      create: { userId, key, filename: 'portrait.jpg', mimeType: 'image/jpeg', sizeBytes: 50_000 },
      select: { id: true },
    });
    await prisma.profilePhoto.create({
      data: { profileId, fileUploadId: fileUpload.id, isPrimary: i === 0, order: i },
    });
  }
}

interface SeedDeps {
  prisma?: PrismaClient;
}

export async function main(_args: string[] = [], deps: SeedDeps = {}): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed-yeoyo-women in production.');
    process.exit(1);
  }

  const prisma = deps.prisma ?? new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 12);

    for (let i = 0; i < PROFILE_COUNT; i++) {
      const email = `${FIXTURE_EMAIL_PREFIX}${String(i + 1).padStart(2, '0')}@example.com`;
      const firstName = pick(FIRST_NAMES, i);
      const lastName = pick(LAST_NAMES, i + 3);
      const age = 22 + (i % 21); // 22..42

      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          passwordHash,
          role: 'USER',
          emailVerifiedAt: new Date(),
          name: `${firstName} ${lastName}`,
        },
        select: { id: true },
      });

      const photoCount = 1 + (i % 3); // 1..3 photos
      const photoUrls = Array.from({ length: photoCount }, (_, j) => portraitUrl(age, i + j * 3));

      const profile = await prisma.profile.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          gender: 'FEMME',
          firstName,
          lastName,
          dateOfBirth: dateOfBirthForAge(age),
          city: 'Kinshasa',
          commune: pick(COMMUNES, i),
          religion: pick(RELIGIONS, i + 2),
          maritalStatus: pick(MARITAL_STATUSES, i),
          childrenCount: pick(CHILDREN_COUNTS, i + 1),
          wantsChildren: pick(WANTS_CHILDREN, i),
          relocateOpen: pick(RELOCATE_OPEN, i + 1),
          qualities: pick(QUALITIES, i),
          flaws: pick(FLAWS, i),
          dealbreakers: pick(DEALBREAKERS, i),
          intent: pick(INTENTS, i),
          job: pick(JOBS, i),
          bio: pick(BIOS, i),
          interests: pickMany(INTERESTS_POOL, i, 4),
          languages: pickMany(LANGUAGES_POOL, i, 2 + (i % 2)),
          visibilityPublic: true,
          onlineStatusVisible: true,
          verificationStatus: i % 5 !== 0 ? 'VERIFIED' : 'PENDING', // 80% verified
          verifiedAt: i % 5 !== 0 ? new Date() : null,
          onboardingCompletedAt: new Date(),
        },
        select: { id: true },
      });

      await ensurePhotos(prisma, profile.id, user.id, photoUrls);

      console.log(
        `✓ ${i + 1}/${PROFILE_COUNT} ${firstName} ${lastName} (${age} ans, ${photoCount} photo(s))`,
      );
    }

    console.log(`\n${PROFILE_COUNT} profils femme créés/actualisés.`);
    console.log(
      `Mot de passe partagé (si tu veux te connecter comme l'une d'elles) : ${FIXTURE_PASSWORD}`,
    );
    console.log(
      `Emails : ${FIXTURE_EMAIL_PREFIX}01@example.com … ${FIXTURE_EMAIL_PREFIX}50@example.com`,
    );
  } finally {
    if (!deps.prisma) {
      await prisma.$disconnect();
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
