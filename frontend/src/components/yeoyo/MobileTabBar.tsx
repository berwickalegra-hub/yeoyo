'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import {
  NAV_ITEMS,
  MOBILE_TAB_IDS,
  badgeFor,
  type SidebarBadgeCounts,
  type SidebarTab,
} from './nav-items';

// Fixed bottom tab bar — the mobile counterpart to Sidebar.tsx's `md:`/`lg:`
// rail-then-full treatment. Only rendered below `md` (Sidebar takes over
// from `md` up). Not shown on the message-thread screen (see
// /app/messages/[id]/page.tsx) — once you're inside a specific
// conversation, a persistent tab bar competes with the message input for
// thumb space, and the thread's own back-chevron already provides
// mobile navigation back to the inbox.
export function MobileTabBar({
  active,
  badgeCounts,
}: {
  active: SidebarTab;
  badgeCounts?: SidebarBadgeCounts | undefined;
}) {
  const items = NAV_ITEMS.filter((item) => MOBILE_TAB_IDS.includes(item.id));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-border bg-surface md:hidden">
      {items.map((item) => {
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
              <span className="absolute right-1/3 top-1.5 h-2 w-2 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
