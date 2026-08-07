import type { IconName } from '@/components/ui/Icon';

// Shared between Sidebar.tsx (tablet rail / desktop full sidebar) and
// MobileTabBar.tsx (mobile bottom bar) so the nav item list, order, and
// hrefs never drift between the two responsive treatments.
export type SidebarTab =
  | 'decouvrir'
  | 'explorer'
  | 'likes'
  | 'demandes'
  | 'messages'
  | 'profil'
  | 'parametres';

export interface NavItem {
  id: SidebarTab;
  icon: IconName;
  label: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'decouvrir', icon: 'layout-grid', label: 'Découvrir', href: '/app/decouvrir' },
  { id: 'explorer', icon: 'compass', label: 'Explorer', href: '/app/explorer' },
  { id: 'likes', icon: 'heart', label: 'Mes likes', href: '/app/likes' },
  { id: 'demandes', icon: 'users', label: 'Demandes', href: '/app/demandes' },
  { id: 'messages', icon: 'message-circle', label: 'Messages', href: '/app/messages' },
  { id: 'profil', icon: 'user', label: 'Mon profil', href: '/app/profil' },
  { id: 'parametres', icon: 'settings', label: 'Paramètres', href: '/app/parametres' },
];

// Bottom tab bar only has room for ~5 icons on a phone screen — the
// highest-traffic tabs per the Banani nav (Découvrir/Explorer are two
// entries into the same discovery loop, so both stay; "Mes likes" is
// reachable from the sidebar/desktop rail but left off the mobile bar to
// keep it to 5 icons).
export const MOBILE_TAB_IDS: SidebarTab[] = [
  'decouvrir',
  'explorer',
  'demandes',
  'messages',
  'parametres',
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
