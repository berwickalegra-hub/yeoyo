// First-visit guided tour ("visite guidée") — content + "already seen" flag.
//
// The flag lives in localStorage (per-device, no migration, no server round
// trip). Clearing site data re-shows the tour, which is acceptable for a
// welcome walkthrough. Upgrade to a Profile column later if cross-device
// "seen" state ever matters.

export interface TourStep {
  /** `data-tour="<target>"` value to spotlight. Omit for a centered card
   *  (welcome / closing). */
  target?: string;
  title: string;
  body: string;
}

export const TOUR_STORAGE_KEY = 'yeoyo.tour.v1';

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Bienvenue sur YeOyo 👋',
    body: 'Un tour rapide pour te montrer où tout se trouve. Ça prend 30 secondes — tu peux passer quand tu veux.',
  },
  {
    target: 'accueil',
    title: 'Accueil',
    body: "Ta page d'arrivée : les profils qu'on te recommande et un aperçu de ton activité.",
  },
  {
    target: 'decouvrir',
    title: 'Découvrir',
    body: 'Fais défiler les profils un par un et envoie une demande de contact à ceux qui te plaisent.',
  },
  {
    target: 'demandes',
    title: 'Demandes',
    body: 'Toutes tes demandes de contact au même endroit : celles que tu as reçues et celles que tu as envoyées.',
  },
  {
    target: 'messages',
    title: 'Messages',
    body: "Tes conversations. Une discussion s'ouvre dès qu'une demande de contact est acceptée des deux côtés.",
  },
  {
    target: 'compte',
    title: 'Ton compte',
    body: 'Ton profil, tes crédits, la vérification et tous tes réglages sont regroupés ici.',
  },
  {
    title: "C'est tout !",
    body: 'Tu peux relancer cette visite à tout moment depuis Paramètres › À propos. Bonnes rencontres !',
  },
];

export function hasSeenTour(): boolean {
  try {
    return !!window.localStorage.getItem(TOUR_STORAGE_KEY);
  } catch {
    // Private mode / storage disabled — treat as "seen" so we never trap the
    // user in a tour that can't remember being dismissed.
    return true;
  }
}

export function markTourSeen(): void {
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, String(Date.now()));
  } catch {
    /* nothing we can do; the tour just won't persist */
  }
}

export function resetTour(): void {
  try {
    window.localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
