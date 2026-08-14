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
// row on mobile. Order deliberately deviates from Banani's TopNav.jsx
// (2026-08-14, explicit user ask): 'Découvrir' centered as the emphasized
// middle tab, 'Visiteurs' pushed to the trailing/rightmost slot.
export const TOPNAV_ITEMS: NavItem[] = [
  { id: 'accueil', icon: 'home', label: 'Accueil', href: '/app/decouvrir' },
  { id: 'favoris', icon: 'heart', label: 'Favoris', href: '/app/favoris' },
  { id: 'decouvrir', icon: 'search', label: 'Découvrir', href: '/app/explorer' },
  { id: 'demandes', icon: 'users', label: 'Demandes', href: '/app/demandes' },
  { id: 'visiteurs', icon: 'eye', label: 'Visiteurs', href: '/app/visiteurs' },
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

// Plain href links, not primary nav tabs, so they don't need a SidebarTab id
// (nothing highlights them as "active"). Re-added to the avatar dropdown
// (2026-08-14, third pass, explicit user ask) after living as a standalone
// card at the bottom of /app/profil — that card is gone now, this list is
// its only home, reused by TopNav's AccountMenu on both desktop and mobile
// (mobile previously had no way to reach these at all, just a bare avatar
// link to /app/profil).
export interface SettingsMenuLink {
  icon: IconName;
  label: string;
  href: string;
}

export const SETTINGS_MENU_ITEMS: SettingsMenuLink[] = [
  { icon: 'user', label: 'Compte', href: '/app/parametres/compte' },
  { icon: 'bell', label: 'Notifications', href: '/app/parametres/notifications' },
  { icon: 'palette', label: 'Apparence', href: '/app/parametres/apparence' },
  { icon: 'credit-card', label: 'Paiement', href: '/app/parametres/paiement' },
  { icon: 'lock', label: 'Confidentialité', href: '/app/parametres/confidentialite' },
  { icon: 'info', label: 'À propos', href: '/app/parametres/apropos' },
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
