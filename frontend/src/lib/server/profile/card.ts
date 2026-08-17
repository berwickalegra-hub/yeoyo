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

const MARITAL_STATUS_LABELS: Record<string, string> = {
  CELIBATAIRE: 'Célibataire',
  DIVORCE: 'Divorcé(e)',
  VEUF_VEUVE: 'Veuf / Veuve',
};

// Onboarding never collects job/interests/languages (Banani's own mockup
// gap — profile cards show them, the Onboarding Flow screen never asks for
// them) — tags are built only from fields the wizard actually captures.
export function profileTags(
  p: Pick<Profile, 'religion' | 'childrenCount' | 'maritalStatus'>,
): string[] {
  const tags: string[] = [];
  if (p.maritalStatus) tags.push(MARITAL_STATUS_LABELS[p.maritalStatus] ?? p.maritalStatus);
  if (p.religion) tags.push(RELIGION_LABELS[p.religion] ?? p.religion);
  if (p.childrenCount) {
    tags.push(p.childrenCount === '0' ? 'Sans enfant' : `${p.childrenCount} enfant(s)`);
  }
  return tags;
}

type ProfileWithPhotos = Profile & {
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
  // Ordered (by ProfilePhoto.order), primary first — powers the
  // WhatsApp-status-style photo carousel on the swipe card / detail page.
  // Empty array when the profile has no photo yet (same as photoUrl: null).
  photoUrls: string[];
  verified: boolean;
  // Whether this profile's owner currently has an ACTIVE subscription.
  // `toProfileCard` can't compute this itself (lives in a separate
  // `Subscription` row, not on `Profile`) — defaults to false here; callers
  // overlay the real value via `getPremiumUserIds()` after batching a
  // lookup across every userId in the response (same anti-N+1 shape as the
  // existing `liked`/`favorited` overlays).
  isPremium: boolean;
  bio: string | null;
  religion: string | null;
  maritalStatus: string | null;
  childrenCount: string | null;
  wantsChildren: string | null;
  relocateOpen: string | null;
  qualities: string | null;
  flaws: string | null;
  dealbreakers: string | null;
  interests: string[];
}

export function toProfileCard(p: ProfileWithPhotos): ProfileCard {
  // Callers order photos by `order` asc; primary (if any) still wins the
  // singular photoUrl even if it isn't first in that order (matches the old
  // isPrimary-only query's behavior before the multi-photo carousel).
  const primary = p.photos.find((ph) => ph.isPrimary) ?? p.photos[0];
  const photoUrls = p.photos
    .map((ph) => cloudinaryUrlForKey(ph.fileUpload.key))
    .filter((url): url is string => !!url);
  return {
    userId: p.userId,
    firstName: p.firstName,
    age: ageInYears(p.dateOfBirth),
    job: p.job,
    commune: p.commune,
    intent: p.intent,
    tags: profileTags(p),
    photoUrl: primary ? cloudinaryUrlForKey(primary.fileUpload.key) : null,
    photoUrls,
    verified: !!p.verifiedAt,
    isPremium: false,
    bio: p.bio,
    religion: p.religion,
    maritalStatus: p.maritalStatus,
    childrenCount: p.childrenCount,
    wantsChildren: p.wantsChildren,
    relocateOpen: p.relocateOpen,
    qualities: p.qualities,
    flaws: p.flaws,
    dealbreakers: p.dealbreakers,
    interests: p.interests,
  };
}
