export interface ProfileCard {
  userId: string;
  firstName: string;
  age: number;
  job: string | null;
  commune: string | null;
  intent: string;
  tags: string[];
  photoUrl: string | null;
  photoUrls: string[];
  verified: boolean;
  // Whether this profile's owner currently has an ACTIVE subscription —
  // always populated (unlike `liked`/`favorited`/`boosted` below), same
  // shape as `verified`.
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
  // Only populated by endpoints that know the caller's identity and compute
  // it server-side (currently /api/profiles/explorer and /api/profiles/[userId]
  // via a sibling field) — undefined elsewhere, treat as "not liked".
  liked?: boolean;
  // Personal bookmark (POST/DELETE /api/favorites) — distinct from `liked`,
  // no side effect on ContactRequest. Only populated by /api/profiles/explorer.
  favorited?: boolean;
  // True while Profile.boostedUntil is in the future — only populated by
  // /api/profiles/explorer (see its boost tie-break ordering).
  boosted?: boolean;
}

export const INTENT_LABELS: Record<string, string> = {
  COURT_TERME: 'Mariage à court terme',
  MOYEN_TERME: 'Mariage à moyen terme',
  LONG_TERME: 'Mariage à long terme',
};

export const RELIGION_LABELS: Record<string, string> = {
  CHRETIEN: 'Chrétien(ne)',
  CATHOLIQUE: 'Catholique',
  PROTESTANT: 'Protestant(e)',
  MUSULMAN: 'Musulman(e)',
};

export const MARITAL_STATUS_LABELS: Record<string, string> = {
  CELIBATAIRE: 'Célibataire',
  DIVORCE: 'Divorcé(e)',
  VEUF_VEUVE: 'Veuf / Veuve',
};

export const WANTS_CHILDREN_LABELS: Record<string, string> = {
  OUI: 'Oui',
  NON: 'Non',
  PEUT_ETRE: 'Peut-être',
};

export const RELOCATE_LABELS: Record<string, string> = {
  OUI: 'Oui',
  NON: 'Non',
  A_DISCUTER: 'À discuter',
};
