'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { TopNav, type SidebarUser, type SidebarBadgeCounts } from './TopNav';
import { MobileTabBar } from './MobileTabBar';
import { CoachWidget } from './CoachWidget';
import type { SidebarTab } from './nav-items';
import { useAuth } from '@/contexts/AuthContext';

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
  showCoach = true,
  compactMobileNav = false,
  hideTopStripOnMobile = false,
  children,
}: {
  active: SidebarTab;
  user: SidebarUser;
  badgeCounts?: SidebarBadgeCounts | undefined;
  /** Découvrir (Explorer) already stacks a raised nav FAB, the SwipeCard's
   * own action row, and the swipe gestures themselves — the Coach bubble
   * added one floating element too many there (2026-08-17, explicit user
   * report). Every other screen keeps it; only that one call site opts out. */
  showCoach?: boolean;
  /** Découvrir (Explorer) only (2026-08-17, explicit user report): swaps
   * MobileTabBar's full 5-tab bar for a single "Accueil" button — that
   * screen's own action row + raised Découvrir FAB already fill the same
   * thumb zone, so the full bar was one row of controls too many. Desktop's
   * TopNav is unaffected either way (no crowding there). */
  compactMobileNav?: boolean;
  /** Découvrir (Explorer) only (2026-08-19, explicit user ask — reverted
   * from an earlier attempt that also removed MobileTabBar and replaced it
   * with a floating back button: the user reported that left mobile Safari
   * with no fixed bottom element at all, which made its own viewport-chrome
   * sizing less predictable, and removed their only way back to Accueil).
   * Hides ONLY TopNav's mobile top strip to reclaim vertical space for the
   * swipe card; MobileTabBar (paired with `compactMobileNav` above) stays
   * as the single "Accueil" button it always was on this screen. Desktop's
   * TopNav is unaffected either way. */
  hideTopStripOnMobile?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useAuth();

  // Every /app/* screen renders through AppShell (the onboarding wizard
  // itself does not), so gating here is the single choke point that stops
  // an incomplete profile (fresh Google sign-in, or the wizard abandoned
  // partway) from reaching pages that assume a Profile row exists —
  // 2026-08-18, explicit user report of console errors while browsing
  // Découvrir with "Compléter le profil" left unfinished.
  useEffect(() => {
    if (authLoading || !authUser) return;
    if (!authUser.profileCompleted) router.replace('/onboarding');
  }, [authLoading, authUser, router]);

  return (
    // No min-height here on purpose — the root layout's wrapper already
    // guarantees `min-h-dvh` and this fills whatever space remains under it
    // via `flex-1` (see layout.tsx's comment: adding our own min-height back
    // would stack a full viewport on top of the install banner instead of
    // sharing the real one, reproducing the exact bug this fixed).
    <div className="flex flex-1 flex-col bg-background font-body">
      <TopNav
        active={active}
        user={user}
        badgeCounts={badgeCounts}
        hideMobileStrip={hideTopStripOnMobile}
      />
      <div className="flex flex-1 flex-col pb-16 md:pb-0">{children}</div>
      <MobileTabBar
        active={active}
        badgeCounts={badgeCounts}
        variant={compactMobileNav ? 'minimal' : 'full'}
      />
      {showCoach && <CoachWidget />}
    </div>
  );
}
