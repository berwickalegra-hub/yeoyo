'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { TOPNAV_ITEMS, badgeFor, type SidebarBadgeCounts, type SidebarTab } from './nav-items';

// Fixed bottom tab bar — the mobile counterpart to TopNav.tsx's desktop
// center row. Same 5 primary tabs, same order, flat/equal-weight styling
// (no raised center FAB — Banani's own TopNav treats all 5 tabs equally,
// so this mirrors that rather than reintroducing the old sidebar-era FAB
// treatment). Only rendered below `md` (TopNav's desktop bar takes over
// from `md` up). Not shown on the message-thread screen (see
// /app/messages/[id]/page.tsx) — a persistent tab bar would compete with
// the message input for thumb space there.
export function MobileTabBar({
  active,
  badgeCounts,
}: {
  active: SidebarTab;
  badgeCounts?: SidebarBadgeCounts | undefined;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-border bg-surface md:hidden">
      {TOPNAV_ITEMS.map((item) => {
        const isActive = item.id === active;
        const badge = badgeFor(item.id, badgeCounts);
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
