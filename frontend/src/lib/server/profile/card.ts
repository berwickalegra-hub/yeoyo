// Shared helpers for turning a Profile row into the shape the discovery
// screens (Découverte, Explorer) render as a card. Used by
// /api/profile, /api/profiles/discover, /api/profiles/explorer — extracted
// here once a third call site needed the same age/tag logic.
import type { FileUpload, Profile, ProfilePhoto } from '@prisma/client';
import { cloudinaryUrlForKey } from '@/lib/server/storage';

export function ageInYears(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

const RELIGION_LABELS: Record<string, string> = {
  CHRETIEN: 'Chrétien(ne)',
  CATHOLIQUE: 'Catholique',
  PROTESTANT: 'Protestant(e)',
  MUSULMAN: 'Musulman(e)',
};

// Onboarding never collects job/interests/languages (Banani's own mockup
// gap — profile cards show them, the Onboarding Flow screen never asks for
// them) — tags are built only from fields the wizard actually captures.
export function profileTags(p: Pick<Profile, 'religion' | 'childrenCount'>): string[] {
  const tags: string[] = [];
  if (p.religion) tags.push(RELIGION_LABELS[p.religion] ?? p.religion);
  if (p.childrenCount) {
    tags.push(p.childrenCount === '0' ? 'Sans enfant' : `${p.childrenCount} enfant(s)`);
  }
  return tags;
}

type ProfileWithPrimaryPhoto = Profile & {
  photos: (ProfilePhoto & { fileUpload: FileUpload })[];
};

export interface ProfileCard {
  userId: string;
  firstName: string;
  age: number;
  job: string | null;
  commune: string | null;
  intent: string;
  tags: string[];
  photoUrl: string | null;
  verified: boolean;
}

export function toProfileCard(p: ProfileWithPrimaryPhoto): ProfileCard {
  const photo = p.photos[0];
  return {
    userId: p.userId,
    firstName: p.firstName,
    age: ageInYears(p.dateOfBirth),
    job: p.job,
    commune: p.commune,
    intent: p.intent,
    tags: profileTags(p),
    photoUrl: photo ? cloudinaryUrlForKey(photo.fileUpload.key) : null,
    verified: !!p.verifiedAt,
  };
}
