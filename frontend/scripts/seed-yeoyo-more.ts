// Second illustration-profile batch (2026-08-20), on top of
// seed-yeoyo-profiles.ts's original 13-fixture set. Explicit user ask this
// round: `prenom@yeoyo.net` email addresses (not the `yeoyo-demo-` prefix)
// so accounts read like real inboxes at a glance, and pre-verified so they
// can be logged into immediately without an email round-trip.
//
// PHOTOS: the user supplied 18 image links, most of them scraped photos of
// real, identifiable people (a Facebook CDN photo of a private individual,
// a Pinterest image, and two named Wikipedia figures). Declined those —
// putting a real, non-consenting person's face on a fake profile on a LIVE
// production app (real users can see it) is worse than the same thing in a
// pure test DB, not equivalent. Used instead: the 2 licensed Pexels photos
// the user also provided, plus this project's own Banani avatar bucket
// (already vetted — see seed-yeoyo-profiles.ts's PHOTOS comment) for the
// rest, picking indices that batch doesn't already use.
//
// Usage: pnpm exec tsx --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/seed-yeoyo-more.ts
//
// Idempotent — upserts keyed on email. Refuses to run with NODE_ENV=production
// (same guard as the other seed scripts).

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';

const FIXTURE_PASSWORD = 'YeoyoDemo123!';
const EMAIL_DOMAIN = 'yeoyo.net';

const RELIGIONS = ['CHRETIEN', 'CATHOLIQUE', 'PROTESTANT', 'MUSULMAN'] as const;
const MARITAL_STATUSES = ['CELIBATAIRE', 'DIVORCE', 'VEUF_VEUVE'] as const;
const CHILDREN_COUNTS = ['0', '1', '2', '3+'] as const;
const INTENTS = ['COURT_TERME', 'MOYEN_TERME', 'LONG_TERME'] as const;
const COMMUNES = ['Gombe', 'Lemba', 'Ngaliema', 'Kalamu', 'Bandalungwa', 'Kintambo', 'Limete'];
const INTERESTS_POOL = ['Musique', 'Cuisine', 'Voyages', 'Lecture', 'Football', 'Danse', 'Église'];
const LANGUAGES_POOL = ['Français', 'Lingala', 'Swahili', 'Kikongo', 'Tshiluba'];

const BIOS = [
  "À la recherche d'une relation sérieuse fondée sur le respect et la foi.",
  'Simple, sincère et prêt(e) à construire une famille solide.',
  'Aime les soirées calmes, la bonne cuisine et les longues conversations.',
  "Croyant(e), famille avant tout. Je cherche quelqu'un de stable.",
  'Ambitieux(se) et déterminé(e), je cherche un partenaire pour avancer ensemble.',
  'Amoureux(se) de musique et de voyages, ouvert(e) à une belle rencontre.',
  'Pas ici pour jouer — je cherche du sérieux et de la sincérité.',
  'Souriant(e), sociable, et fier(ère) de mes origines kinoises.',
];

interface Fixture {
  firstName: string;
  lastName: string;
  gender: 'HOMME' | 'FEMME';
  age: number;
  job: string;
  photoUrl: string;
}

const FIXTURES: Fixture[] = [
  {
    firstName: 'Bénédicte',
    lastName: 'Kalonji',
    gender: 'FEMME',
    age: 27,
    job: 'Infirmière',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/female/25-35/African/8',
  },
  {
    firstName: 'Grace',
    lastName: 'Nzuzi',
    gender: 'FEMME',
    age: 29,
    job: 'Enseignante',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/female/25-35/African/9',
  },
  {
    firstName: 'Fabiola',
    lastName: 'Mbuyi',
    gender: 'FEMME',
    age: 26,
    job: 'Styliste',
    photoUrl:
      'https://images.pexels.com/photos/32730574/pexels-photo-32730574/free-photo-of-femme-souriante-en-tenue-traditionnelle-vibrante.jpeg?cs=tinysrgb&dpr=1&w=500',
  },
  {
    firstName: 'Prisca',
    lastName: 'Kanyinda',
    gender: 'FEMME',
    age: 30,
    job: 'Commerçante',
    photoUrl:
      'https://images.pexels.com/photos/38600696/pexels-photo-38600696.jpeg?cs=srgb&dl=pexels-lanre-agboola-2161553331-38600696.jpg&fm=jpg',
  },
  {
    firstName: 'Clémentine',
    lastName: 'Mwepu',
    gender: 'FEMME',
    age: 38,
    job: 'Avocate',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/female/35-50/African/0',
  },
  {
    firstName: 'Rachel',
    lastName: 'Ntumba',
    gender: 'FEMME',
    age: 41,
    job: 'Comptable',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/female/35-50/African/1',
  },
  {
    firstName: 'Béatrice',
    lastName: 'Kalombo',
    gender: 'FEMME',
    age: 44,
    job: 'Entrepreneuse',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/female/35-50/African/2',
  },
  {
    firstName: 'Angélique',
    lastName: 'Mfumu',
    gender: 'FEMME',
    age: 39,
    job: 'Pharmacienne',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/female/35-50/African/4',
  },
  {
    firstName: 'Christian',
    lastName: 'Mbala',
    gender: 'HOMME',
    age: 28,
    job: 'Ingénieur civil',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/25-35/African/0',
  },
  {
    firstName: 'Fiston',
    lastName: 'Kabeya',
    gender: 'HOMME',
    age: 31,
    job: 'Comptable',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/25-35/African/2',
  },
  {
    firstName: 'Junior',
    lastName: 'Ilunga',
    gender: 'HOMME',
    age: 27,
    job: 'Entrepreneur',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/25-35/African/4',
  },
  {
    firstName: 'Trésor',
    lastName: 'Kanku',
    gender: 'HOMME',
    age: 33,
    job: 'Chauffeur',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/25-35/African/5',
  },
  {
    firstName: 'Yannick',
    lastName: 'Mputu',
    gender: 'HOMME',
    age: 29,
    job: 'Pasteur',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/25-35/African/6',
  },
  {
    firstName: 'Blaise',
    lastName: 'Kasongo',
    gender: 'HOMME',
    age: 32,
    job: 'Ingénieur civil',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/25-35/African/7',
  },
  {
    firstName: 'Innocent',
    lastName: 'Muland',
    gender: 'HOMME',
    age: 42,
    job: 'Entrepreneur',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/35-50/African/0',
  },
  {
    firstName: 'Serge',
    lastName: 'Ndaya',
    gender: 'HOMME',
    age: 45,
    job: 'Pasteur',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/35-50/African/1',
  },
  {
    firstName: 'Willy',
    lastName: 'Bakajika',
    gender: 'HOMME',
    age: 39,
    job: 'Comptable',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/35-50/African/3',
  },
  {
    firstName: 'Olivier',
    lastName: 'Kabongo',
    gender: 'HOMME',
    age: 47,
    job: 'Ingénieur civil',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/35-50/African/4',
  },
];

// Strips accents so `Bénédicte` -> `benedicte@yeoyo.net`, not a
// percent-encoded mess — matches the explicit `prenom@yeoyo.net` ask.
function emailFor(firstName: string): string {
  const slug = firstName.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return `${slug}@${EMAIL_DOMAIN}`;
}

function dateOfBirthForAge(age: number): Date {
  const now = new Date();
  return new Date(now.getFullYear() - age, (age * 7) % 12, 1 + ((age * 3) % 27));
}

function pick<T>(pool: readonly T[], index: number): T {
  return pool[index % pool.length]!;
}

function pickMany<T>(pool: readonly T[], index: number, count: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(pool[(index + i) % pool.length]!);
  return [...new Set(out)];
}

// Same convergence pattern as the other seed scripts' photo helpers —
// idempotent, self-healing if a photoUrl changes on a re-run.
async function ensurePrimaryPhoto(
  prisma: PrismaClient,
  profileId: string,
  userId: string,
  photoUrl: string,
): Promise<void> {
  const key = `${photoUrl}#${userId}`;
  const existing = await prisma.profilePhoto.findFirst({
    where: { profileId, isPrimary: true },
    select: { id: true, fileUpload: { select: { key: true } } },
  });
  if (existing?.fileUpload.key === key) return;

  const fileUpload = await prisma.fileUpload.upsert({
    where: { key },
    update: {},
    create: { userId, key, filename: 'portrait.jpg', mimeType: 'image/jpeg', sizeBytes: 50_000 },
    select: { id: true },
  });

  if (existing) {
    await prisma.profilePhoto.update({
      where: { id: existing.id },
      data: { fileUploadId: fileUpload.id },
    });
  } else {
    await prisma.profilePhoto.create({
      data: { profileId, fileUploadId: fileUpload.id, isPrimary: true, order: 0 },
    });
  }
}

interface SeedDeps {
  prisma?: PrismaClient;
}

export async function main(_args: string[] = [], deps: SeedDeps = {}): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed-yeoyo-more in production.');
    process.exit(1);
  }

  const prisma = deps.prisma ?? new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 12);

    for (const [i, f] of FIXTURES.entries()) {
      const email = emailFor(f.firstName);

      const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          passwordHash,
          role: 'USER',
          emailVerifiedAt: new Date(),
          name: `${f.firstName} ${f.lastName}`,
        },
        select: { id: true },
      });

      const profile = await prisma.profile.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          gender: f.gender,
          firstName: f.firstName,
          lastName: f.lastName,
          dateOfBirth: dateOfBirthForAge(f.age),
          city: 'Kinshasa',
          commune: pick(COMMUNES, i),
          religion: pick(RELIGIONS, i + 2),
          maritalStatus: pick(MARITAL_STATUSES, i),
          childrenCount: pick(CHILDREN_COUNTS, i + 1),
          intent: pick(INTENTS, i),
          job: f.job,
          bio: pick(BIOS, i),
          interests: pickMany(INTERESTS_POOL, i, 4),
          languages: pickMany(LANGUAGES_POOL, i, 2 + (i % 2)),
          visibilityPublic: true,
          onlineStatusVisible: true,
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
          onboardingCompletedAt: new Date(),
        },
        select: { id: true },
      });

      await ensurePrimaryPhoto(prisma, profile.id, user.id, f.photoUrl);

      console.log(`✓ ${email} — ${f.firstName} ${f.lastName} (${f.gender}, ${f.age} ans)`);
    }

    console.log(`\n${FIXTURES.length} profils créés/actualisés.`);
    console.log(`Mot de passe partagé : ${FIXTURE_PASSWORD}`);
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
