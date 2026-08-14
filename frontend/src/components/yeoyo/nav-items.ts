import type { IconName } from '@/components/ui/Icon';

// Shared between TopNav.tsx (desktop bar) and MobileTabBar.tsx (mobile
// bottom bar) so the nav item list, order, and hrefs never drift between
// the two responsive treatments.
//
// IMPORTANT — id/URL mismatch, deliberate: Banani's "Rencontres Sérieuses
// Congo" flow (2026-08-13) ships an "Accueil" screen (home dashboard) and a
// separate "Découvrir" screen (browse/swipe grid). Renaming this project's
// existing route folders to match would touch dozens of cross-references
// for a URL slug users never see — instead the tab *id* follows Banani's
// naming while the *href* keeps pointing at the existing route:
//   - id 'accueil'   → href '/app/decouvrir' (existing home-dashboard route)
//   - id 'decouvrir' → href '/app/explorer'  (existing browse/swipe route)
// See IMPLEMENTATION-PLAN-v2.md decision #2 (Navigation) for the reasoning.
export type SidebarTab =
  | 'accueil'
  | 'decouvrir'
  | 'visiteurs'
  | 'favoris'
  | 'demandes'
  | 'premium'
  | 'messages'
  | 'likes'
  | 'profil'
  | 'parametres';

export interface NavItem {
  id: SidebarTab;
  icon: IconName;
  label: string;
  href: string;
}

// The 5 primary tabs — TopNav's center row on desktop, MobileTabBar's full
// row on mobile. Order matches Banani's TopNav.jsx exactly.
export const TOPNAV_ITEMS: NavItem[] = [
  { id: 'accueil', icon: 'home', label: 'Accueil', href: '/app/decouvrir' },
  { id: 'decouvrir', icon: 'search', label: 'Découvrir', href: '/app/explorer' },
  { id: 'visiteurs', icon: 'eye', label: 'Visiteurs', href: '/app/visiteurs' },
  { id: 'favoris', icon: 'heart', label: 'Favoris', href: '/app/favoris' },
  { id: 'demandes', icon: 'users', label: 'Demandes', href: '/app/demandes' },
];

export const PREMIUM_ITEM: NavItem = {
  id: 'premium',
  icon: 'crown',
  label: 'Premium',
  href: '/app/premium',
};

// Reachable from TopNav's avatar dropdown (desktop) / a "Compte" row in the
// mobile nav, not from the 5 primary tabs — 'heart-handshake' (not 'heart')
// for "Mes likes" so it doesn't read as a second Favoris entry; that route
// is "who liked me" (received Like rows), unrelated to the new Favorite
// bookmark feature.
// No "Paramètres" entry (removed 2026-08-14, second pass, explicit user
// ask) — the /app/parametres index it pointed to was deleted; "Mon profil"
// below is the sole entry point now (its own "Paramètres" sidebar card
// links out to Compte/Notifications/Apparence/Paiement/Confidentialité).
export const ACCOUNT_MENU_ITEMS: NavItem[] = [
  { id: 'profil', icon: 'user', label: 'Mon profil', href: '/app/profil' },
  { id: 'likes', icon: 'heart-handshake', label: 'Mes likes', href: '/app/likes' },
];

export interface SidebarBadgeCounts {
  demandes?: number;
  messages?: number;
}

export function badgeFor(id: SidebarTab, counts?: SidebarBadgeCounts): number | undefined {
  if (id === 'demandes') return counts?.demandes;
  if (id === 'messages') return counts?.messages;
  return undefined;
}
