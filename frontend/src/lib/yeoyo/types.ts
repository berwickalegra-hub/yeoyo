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
  bio: string | null;
  religion: string | null;
  maritalStatus: string | null;
  childrenCount: string | null;
  wantsChildren: string | null;
  relocateOpen: string | null;
  qualities: string | null;
  flaws: string | null;
  dealbreakers: string | null;
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
