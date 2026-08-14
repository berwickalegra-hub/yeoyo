'use client';

import type { ReactNode } from 'react';
import { TopNav, type SidebarUser, type SidebarBadgeCounts } from './TopNav';
import { MobileTabBar } from './MobileTabBar';
import { CoachWidget } from './CoachWidget';
import type { SidebarTab } from './nav-items';

// Shared app-shell layout: TopNav (sticky top, full desktop bar from `md`,
// a compact mobile strip below `md`) + MobileTabBar (fixed bottom, mobile
// only — replaces TopNav's 5 primary tabs below `md`). `pb-16 md:pb-0` on
// the content slot keeps the last bit of scrollable content from sitting
// under the fixed bottom bar.
//
// The content slot is itself `flex flex-col` so a page that needs to fill
// the full viewport height (e.g. the Messages inbox's two-pane layout,
// which relies on a bounded height for its `overflow-y-auto` region) can
// opt in by giving its own root element `flex flex-1` — a plain content
// page (Découvrir, Paramètres, …) doesn't need to and just flows normally.
//
// Not used by /app/messages/[id] (the thread view) — that screen renders
// TopNav directly with no MobileTabBar, see that page's own comment.
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
    <div className="flex min-h-screen flex-col bg-background font-body">
      <TopNav active={active} user={user} badgeCounts={badgeCounts} />
      <div className="flex flex-1 flex-col pb-16 md:pb-0">{children}</div>
      <MobileTabBar active={active} badgeCounts={badgeCounts} />
      <CoachWidget />
    </div>
  );
}
