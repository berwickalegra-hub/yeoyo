// Illustration seed script — creates a curated set of sample YeOyo profiles
// (Kinshasa dating-app domain) plus completes onboarding for the
// seed-dev.ts `user@example.com` account, so Découverte/Explorer have real
// content to render instead of an empty state.
//
// Usage: pnpm seed:yeoyo
//
// Idempotent — upserts keyed on email (fixture users) / userId (the
// `user@example.com` profile), so running multiple times does not duplicate
// rows. Also deletes any stale `yeoyo-demo-*` fixture from an earlier,
// larger run of this script that isn't in FIXTURES below (see "Cleanup").
// Refuses to run with NODE_ENV=production (same guard as seed-dev.ts).
//
// Fixture users get a shared password (see FIXTURE_PASSWORD) so any of them
// can also be logged into directly if you want to test as a specific
// profile — not just view them as `user@example.com`.
//
// PHOTOS: real avatars from this project's own Banani design export (public
// GCS bucket, supplied by the user 2026-08-07) — exactly 9 unique URLs
// exist (Banani gave duplicates beyond these). FIXTURES below is
// deliberately sized to 9 — one profile per unique photo — rather than
// reusing a smaller photo pool across many profiles, so no two fixtures
// show the same face. Extend both FIXTURES and the photo below it together
// if more Banani URLs become available.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';

const FIXTURE_PASSWORD = 'YeoyoDemo123!';
const FIXTURE_EMAIL_PREFIX = 'yeoyo-demo-';

const RELIGIONS = ['CHRETIEN', 'CATHOLIQUE', 'PROTESTANT', 'MUSULMAN'] as const;
const MARITAL_STATUSES = ['CELIBATAIRE', 'DIVORCE', 'VEUF_VEUVE'] as const;
const CHILDREN_COUNTS = ['0', '1', '2', '3+'] as const;
const INTENTS = ['COURT_TERME', 'MOYEN_TERME', 'LONG_TERME'] as const;

const JOBS_HOMME = ['Ingénieur civil', 'Chauffeur', 'Comptable', 'Entrepreneur', 'Pasteur'];
const JOBS_FEMME = ['Infirmière', 'Enseignante', 'Commerçante', 'Styliste', 'Avocate'];

const BIOS = [
  "À la recherche d'une relation sérieuse fondée sur le respect et la foi.",
  'Simple, sincère et prêt(e) à construire une famille solide.',
  'Aime les soirées calmes, la bonne cuisine et les longues conversations.',
  "Croyant(e), famille avant tout. Je cherche quelqu'un de stable.",
  'Ambitieux(se) et déterminé(e), je cherche un partenaire pour avancer ensemble.',
  'Amoureux(se) de musique et de voyages, ouvert(e) à une belle rencontre.',
  'Pas ici pour jouer — je cherche du sérieux et de la sincérité.',
  'Souriant(e), sociable, et fier(ère) de mes origines kinoises.',
  'La foi et la famille guident mes choix. À la recherche de la bonne personne.',
];

const INTERESTS_POOL = ['Musique', 'Cuisine', 'Voyages', 'Lecture', 'Football', 'Danse', 'Église'];
const LANGUAGES_POOL = ['Français', 'Lingala', 'Swahili', 'Kikongo', 'Tshiluba'];
const COMMUNES = ['Gombe', 'Lemba', 'Ngaliema', 'Kalamu', 'Bandalungwa', 'Kintambo', 'Limete'];

interface Fixture {
  email: string;
  gender: 'HOMME' | 'FEMME';
  firstName: string;
  lastName: string;
  age: number;
  verified: boolean;
  photoUrl: string;
}

// One entry per unique Banani avatar URL — age matches the folder the photo
// came from (25-35 vs 35-50) so the portrait looks right for the profile.
const FIXTURES: Fixture[] = [
  {
    email: `${FIXTURE_EMAIL_PREFIX}f01@example.com`,
    gender: 'FEMME',
    firstName: 'Grace',
    lastName: 'Kayembe',
    age: 27,
    verified: true,
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/female/25-35/African/0',
  },
  {
    email: `${FIXTURE_EMAIL_PREFIX}f02@example.com`,
    gender: 'FEMME',
    firstName: 'Divine',
    lastName: 'Bope',
    age: 29,
    verified: false,
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/female/25-35/African/2',
  },
  {
    email: `${FIXTURE_EMAIL_PREFIX}f03@example.com`,
    gender: 'FEMME',
    firstName: 'Bénie',
    lastName: 'Lukusa',
    age: 26,
    verified: true,
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/female/25-35/African/4',
  },
  {
    email: `${FIXTURE_EMAIL_PREFIX}f04@example.com`,
    gender: 'FEMME',
    firstName: 'Nadège',
    lastName: 'Mavinga',
    age: 31,
    verified: true,
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/female/25-35/African/6',
  },
  {
    email: `${FIXTURE_EMAIL_PREFIX}f05@example.com`,
    gender: 'FEMME',
    firstName: 'Clarisse',
    lastName: 'Kazadi',
    age: 41,
    verified: false,
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/female/35-50/African/3',
  },
  {
    email: `${FIXTURE_EMAIL_PREFIX}h01@example.com`,
    gender: 'HOMME',
    firstName: 'Patrick',
    lastName: 'Mbala',
    age: 28,
    verified: true,
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/25-35/African/1',
  },
  {
    email: `${FIXTURE_EMAIL_PREFIX}h02@example.com`,
    gender: 'HOMME',
    firstName: 'Emmanuel',
    lastName: 'Kanku',
    age: 30,
    verified: false,
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/25-35/African/3',
  },
  {
    email: `${FIXTURE_EMAIL_PREFIX}h03@example.com`,
    gender: 'HOMME',
    firstName: 'Dieudonné',
    lastName: 'Kasongo',
    age: 42,
    verified: true,
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/35-50/African/2',
  },
  {
    email: `${FIXTURE_EMAIL_PREFIX}h04@example.com`,
    gender: 'HOMME',
    firstName: 'Guelord',
    lastName: 'Mwamba',
    age: 45,
    verified: true,
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/35-50/African/8',
  },
];

// The demo account reuses this fixture's photo (only 9 unique images exist
// in total, all already assigned above) — ensurePrimaryPhoto's per-user key
// keeps that a non-issue for the unique constraints.
const DEMO_USER_PHOTO_URL = FIXTURES.find((f) => f.email.includes('h03'))!.photoUrl;

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

// Idempotent + self-healing: converges the profile's primary photo to
// `photoUrl` regardless of what a previous run of this script set it to
// (safe to re-run after changing FIXTURES or swapping photo sources).
//
// `FileUpload.key` is unique and so is `ProfilePhoto.fileUploadId` — since
// the demo account's photo is shared with a fixture, the DB key is
// `${photoUrl}#${userId}` to keep it unique per profile while the served
// URL (before the URL fragment, which browsers never send to the server)
// still resolves to the same image.
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
    create: {
      userId,
      key,
      filename: 'portrait.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 50_000,
    },
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

// Removes fixtures from an earlier, larger run of this script (up to 50
// generated names) that aren't in FIXTURES anymore — cascades to their
// Profile/ProfilePhoto/Like/ContactRequest rows via the schema's onDelete:
// Cascade relations. Orphaned FileUpload rows (userId set null on User
// delete, since that relation is SetNull not Cascade) are swept separately.
async function cleanupStaleFixtures(prisma: PrismaClient, keepEmails: string[]): Promise<void> {
  const stale = await prisma.user.findMany({
    where: {
      AND: [{ email: { startsWith: FIXTURE_EMAIL_PREFIX } }, { email: { notIn: keepEmails } }],
    },
    select: { id: true, email: true },
  });
  if (stale.length === 0) return;

  await prisma.user.deleteMany({ where: { id: { in: stale.map((u) => u.id) } } });
  await prisma.fileUpload.deleteMany({ where: { userId: null } });
  console.log(`✓ ${stale.length} anciens profils fixture (photos dupliquées) supprimés`);
}

interface SeedDeps {
  prisma?: PrismaClient;
}

export async function main(_args: string[] = [], deps: SeedDeps = {}): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed-yeoyo-profiles in production.');
    process.exit(1);
  }

  const prisma = deps.prisma ?? new PrismaClient();
  try {
    await cleanupStaleFixtures(
      prisma,
      FIXTURES.map((f) => f.email),
    );

    const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 12);

    for (const [i, f] of FIXTURES.entries()) {
      const user = await prisma.user.upsert({
        where: { email: f.email },
        update: {},
        create: {
          email: f.email,
          passwordHash,
          role: 'USER',
          emailVerifiedAt: new Date(),
          name: `${f.firstName} ${f.lastName}`,
        },
        select: { id: true },
      });

      const commune = pick(COMMUNES, i);
      const religion = pick(RELIGIONS, i + 2);
      const maritalStatus = pick(MARITAL_STATUSES, i);
      const childrenCount = pick(CHILDREN_COUNTS, i + 1);
      const intent = pick(INTENTS, i);
      const job = pick(f.gender === 'HOMME' ? JOBS_HOMME : JOBS_FEMME, i);
      const bio = pick(BIOS, i);
      const interests = pickMany(INTERESTS_POOL, i, 4);
      const languages = pickMany(LANGUAGES_POOL, i, 2 + (i % 2));

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
          commune,
          religion,
          maritalStatus,
          childrenCount,
          intent,
          job,
          bio,
          interests,
          languages,
          visibilityPublic: true,
          onlineStatusVisible: true,
          verificationStatus: f.verified ? 'VERIFIED' : 'PENDING',
          verifiedAt: f.verified ? new Date() : null,
          onboardingCompletedAt: new Date(),
        },
        select: { id: true },
      });

      await ensurePrimaryPhoto(prisma, profile.id, user.id, f.photoUrl);

      console.log(`✓ ${f.firstName} ${f.lastName} (${f.gender}, ${commune}, ${f.age} ans)`);
    }

    // Give the seed-dev.ts `user@example.com` account a completed profile
    // so Découverte/Explorer show these fixtures instead of PROFILE_REQUIRED.
    const demoUser = await prisma.user.findUnique({ where: { email: 'user@example.com' } });
    if (demoUser) {
      const demoProfile = await prisma.profile.upsert({
        where: { userId: demoUser.id },
        update: {},
        create: {
          userId: demoUser.id,
          gender: 'HOMME',
          firstName: 'Utilisateur',
          lastName: 'Démo',
          dateOfBirth: dateOfBirthForAge(30),
          city: 'Kinshasa',
          commune: 'Gombe',
          religion: 'CHRETIEN',
          maritalStatus: 'CELIBATAIRE',
          childrenCount: '0',
          intent: 'LONG_TERME',
          job: 'Entrepreneur',
          bio: 'Compte de démonstration — voir onboarding pour éditer ce profil.',
          interests: ['Musique', 'Voyages'],
          languages: ['Français', 'Lingala'],
          visibilityPublic: true,
          onlineStatusVisible: true,
          verificationStatus: 'VERIFIED',
          verifiedAt: new Date(),
          onboardingCompletedAt: new Date(),
        },
        select: { id: true },
      });
      await ensurePrimaryPhoto(prisma, demoProfile.id, demoUser.id, DEMO_USER_PHOTO_URL);
      console.log('✓ user@example.com — profil complété (HOMME, verra les profils FEMME)');

      // The FEMME fixtures "like" the demo account so /app/likes and
      // /app/demandes have real content instead of an empty state.
      const likers = FIXTURES.filter((f) => f.gender === 'FEMME');
      for (const liker of likers) {
        const likerUser = await prisma.user.findUnique({ where: { email: liker.email } });
        if (!likerUser) continue;
        await prisma.like.upsert({
          where: { likerId_likedId: { likerId: likerUser.id, likedId: demoUser.id } },
          update: {},
          create: { likerId: likerUser.id, likedId: demoUser.id },
        });
        await prisma.contactRequest.upsert({
          where: { requesterId_targetId: { requesterId: likerUser.id, targetId: demoUser.id } },
          update: {},
          create: { requesterId: likerUser.id, targetId: demoUser.id },
        });
      }
      console.log(`✓ ${likers.length} likes de démo envoyés à user@example.com`);
    } else {
      console.log('(user@example.com introuvable — lance `pnpm seed:dev` avant ce script)');
    }

    console.log(`\n${FIXTURES.length} profils fixture créés/actualisés.`);
    console.log(
      `Mot de passe partagé (si tu veux te connecter comme un profil fixture) : ${FIXTURE_PASSWORD}`,
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
