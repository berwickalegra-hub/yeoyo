'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  TOPNAV_ITEMS,
  badgeFor,
  type SidebarBadgeCounts,
  type SidebarTab,
  type NavItem,
} from './nav-items';

const ACCUEIL_ITEM = TOPNAV_ITEMS.find((i) => i.id === 'accueil') as NavItem;

// "Activité" tab (2026-08-17, explicit user ask): a tap opens a small
// upward popover instead of navigating straight to /app/visiteurs — the tab
// is a menu now, not a link. 2026-08-20: Messages was promoted to its own
// primary tab (needed more visibility than a submenu gave it) and Favoris
// moved in here to take its place. Highlighted whenever either destination
// is active, not just 'visiteurs'.
function ActivityTab({ active }: { active: SidebarTab }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isActive = active === 'visiteurs' || active === 'favoris';

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Activité — Favoris et Visiteurs"
        aria-expanded={open}
        className={`relative flex flex-1 flex-col items-center justify-center gap-1 ${
          isActive ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Icon name="menu" size={20} />
        <span className="font-body text-[10px] font-medium">Activité</span>
      </button>

      {open && (
        <div className="animate-scale-in absolute bottom-16 right-0 z-50 w-56 origin-bottom-right overflow-hidden rounded-2xl border border-border bg-surface p-2 shadow-2xl">
          <Link
            href="/app/favoris"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 font-body text-sm text-foreground transition-colors hover:bg-muted"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon name="heart" size={17} className="text-muted-foreground" />
            </span>
            Favoris
          </Link>
          <Link
            href="/app/visiteurs"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 font-body text-sm text-foreground transition-colors hover:bg-muted"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
              <Icon name="eye" size={17} className="text-muted-foreground" />
            </span>
            Visiteurs
          </Link>
        </div>
      )}
    </div>
  );
}

// Fixed bottom tab bar — the mobile counterpart to TopNav.tsx's desktop
// center row. Same 5 primary tabs, same order, flat/equal-weight styling
// (no raised center FAB — Banani's own TopNav treats all 5 tabs equally,
// so this mirrors that rather than reintroducing the old sidebar-era FAB
// treatment). Only rendered below `md` (TopNav's desktop bar takes over
// from `md` up). Not shown on the message-thread screen (see
// /app/messages/[id]/page.tsx) — a persistent tab bar would compete with
// the message input for thumb space there.
//
// `variant="minimal"` (Découvrir/Explorer only, 2026-08-17 explicit user
// report): that screen already stacks its own 3-button action row right
// above this bar, and the raised Découvrir FAB sits directly above THAT —
// three rows of controls fighting for the same thumb zone. Swapping the
// full 5-tab bar for a single "back to Accueil" button on this one screen
// removes a whole row of visual noise; every other screen keeps the full
// bar untouched.
export function MobileTabBar({
  active,
  badgeCounts,
  variant = 'full',
}: {
  active: SidebarTab;
  badgeCounts?: SidebarBadgeCounts | undefined;
  variant?: 'full' | 'minimal';
}) {
  if (variant === 'minimal') {
    return (
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-center border-t border-border bg-surface md:hidden">
        <Link
          href={ACCUEIL_ITEM.href}
          className="flex items-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-muted-foreground transition-transform active:scale-95"
        >
          <Icon name={ACCUEIL_ITEM.icon} size={18} />
          <span className="font-body text-sm font-medium">Accueil</span>
        </Link>
      </nav>
    );
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-border bg-surface md:hidden">
      {TOPNAV_ITEMS.map((item) => {
        const isActive = item.id === active;
        const badge = badgeFor(item.id, badgeCounts);

        // Découvrir is the app's primary action (browse profiles) — kept
        // permanently emphasized, not just on `isActive`, via a raised
        // filled-primary circle that pokes above the bar (standard "FAB in
        // bottom nav" dating-app pattern). `nav-items.ts` already centers
        // this tab in TOPNAV_ITEMS specifically for this treatment.
        if (item.id === 'decouvrir') {
          return (
            <Link
              key={item.id}
              href={item.href}
              className="relative flex flex-1 flex-col items-center justify-end gap-1 pb-2"
            >
              <span className="absolute -top-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/40">
                <Icon name={item.icon} size={24} className="text-primary-foreground" />
              </span>
              <span className="font-body text-[10px] font-medium text-primary">{item.label}</span>
            </Link>
          );
        }

        if (item.id === 'visiteurs') {
          return <ActivityTab key={item.id} active={active} />;
        }

        return (
          <Link
            key={item.id}
            href={item.href}
            className={`relative flex flex-1 flex-col items-center justify-center gap-1 ${
              isActive ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon name={item.icon} size={20} />
            <span className="font-body text-[10px] font-medium">{item.label}</span>
            {!!badge && (
              <span className="absolute right-1/4 top-1.5 h-2 w-2 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
