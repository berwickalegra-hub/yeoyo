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

export const INTENT_LABELS: Record<string, string> = {
  COURT_TERME: 'Mariage à court terme',
  MOYEN_TERME: 'Mariage à moyen terme',
  LONG_TERME: 'Mariage à long terme',
};
