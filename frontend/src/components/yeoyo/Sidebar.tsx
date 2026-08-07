'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { NAV_ITEMS, badgeFor, type SidebarBadgeCounts, type SidebarTab } from './nav-items';

export type { SidebarTab, SidebarBadgeCounts };

export interface SidebarUser {
  name: string;
  avatarUrl?: string | null | undefined;
  verified?: boolean;
}

// Responsive behavior (no Banani mockup to crib from — the export never
// included a mobile/tablet treatment for any authenticated screen, see
// STATUS.md's responsive-design pass entry): hidden below `md` (replaced
// by MobileTabBar.tsx), an icon-only rail at `md`, the full labeled
// sidebar from `lg` up. `hidden md:flex` also drops the old hardcoded
// `minHeight: '900px'` inline style from the Banani export — that was an
// artboard-canvas leftover; the flex parent's `min-h-screen` already
// stretches this aside to full height without it.
export function Sidebar({
  active,
  user,
  badgeCounts,
}: {
  active: SidebarTab;
  user: SidebarUser;
  badgeCounts?: SidebarBadgeCounts | undefined;
}) {
  return (
    <aside className="hidden flex-shrink-0 flex-col border-r border-border bg-surface md:flex md:w-20 lg:w-60">
      <div className="flex items-center gap-3 border-b border-border px-4 py-6 md:justify-center lg:justify-start lg:px-6">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary">
          <span className="font-headings text-base font-bold text-primary-foreground">Y</span>
        </div>
        <span className="hidden font-headings text-lg font-bold text-foreground lg:inline">
          YeOyo
        </span>
      </div>

      <div className="flex items-center gap-3 border-b border-border px-3 py-5 md:justify-center lg:justify-start lg:px-5">
        <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={40} />
        <div className="hidden overflow-hidden lg:block">
          <p className="truncate font-headings text-sm font-semibold text-foreground">
            {user.name}
          </p>
          {user.verified && (
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-verified" />
              <span className="font-body text-xs text-muted-foreground">Profil vérifié</span>
            </div>
          )}
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === active;
          const badge = badgeFor(item.id, badgeCounts);
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 md:justify-center md:px-0 lg:justify-start lg:px-3 ${
                isActive ? 'bg-secondary text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon name={item.icon} size={18} />
              <span className="hidden flex-1 font-body text-sm font-medium lg:inline">
                {item.label}
              </span>
              {!!badge && (
                <>
                  <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-primary md:block lg:hidden" />
                  <span className="hidden h-5 w-5 items-center justify-center rounded-full bg-primary font-body text-xs font-bold text-primary-foreground lg:flex">
                    {badge}
                  </span>
                </>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-border px-4 py-4 lg:block">
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="mb-1 font-headings text-sm font-semibold text-foreground">
            Débloquer les likes
          </p>
          <p className="mb-3 font-body text-xs text-muted-foreground">
            Vois qui t&rsquo;a liké en premier.
          </p>
          <Link
            href="/app/premium"
            className="block w-full rounded-lg bg-primary py-2 text-center font-body text-xs font-semibold text-primary-foreground"
          >
            Activer via Mobile Money
          </Link>
        </div>
      </div>
    </aside>
  );
}
