'use client';

import type { ReactNode } from 'react';
import { Sidebar, type SidebarUser, type SidebarBadgeCounts } from './Sidebar';
import { MobileTabBar } from './MobileTabBar';
import type { SidebarTab } from './nav-items';

// Shared app-shell layout: Sidebar (hidden on mobile, icon rail at `md`,
// full at `lg` — see Sidebar.tsx) + MobileTabBar (mobile-only, replaces
// the sidebar below `md`). `pb-16 md:pb-0` on the content slot keeps the
// last bit of scrollable content from sitting under the fixed bottom bar.
//
// The content slot is itself `flex flex-col` so a page that needs to fill
// the full viewport height (e.g. the Messages inbox's two-pane layout,
// which relies on a bounded height for its `overflow-y-auto` region) can
// opt in by giving its own root element `flex flex-1` — a plain content
// page (Découvrir, Paramètres, …) doesn't need to and just flows normally.
//
// Not used by /app/messages/[id] (the thread view) — that screen
// deliberately omits the bottom tab bar, see MobileTabBar.tsx's comment.
export function AppShell({
  active,
  user,
  badgeCounts,
  children,
}: {
  active: SidebarTab;
  user: SidebarUser;
  badgeCounts?: SidebarBadgeCounts | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background font-body">
      <Sidebar active={active} user={user} badgeCounts={badgeCounts} />
      <div className="flex flex-1 flex-col pb-16 md:pb-0">{children}</div>
      <MobileTabBar active={active} badgeCounts={badgeCounts} />
    </div>
  );
}
