'use client';

// Desktop-first horizontal top navigation, replacing Sidebar.tsx per the
// "Rencontres Sérieuses Congo" Banani re-theme (2026-08-13) — reproduces
// Banani's TopNav.jsx (logo, 5 primary tabs, gold Premium tab, Boost
// button, Messages icon+badge, notification bell, avatar dropdown).
// Banani only exported a desktop bar; the `md:hidden` block below is this
// session's own compact mobile top strip (logo + messages + bell + avatar
// link — no dropdown, no Boost button, kept deliberately light since the
// 5 primary tabs move to MobileTabBar.tsx's bottom bar on mobile and Boost
// is also reachable from the Accueil dashboard).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { NotificationBell } from './NotificationBell';
import {
  TOPNAV_ITEMS,
  PREMIUM_ITEM,
  ACCOUNT_MENU_ITEMS,
  badgeFor,
  type SidebarBadgeCounts,
  type SidebarTab,
} from './nav-items';

export type { SidebarTab, SidebarBadgeCounts };

export interface SidebarUser {
  name: string;
  avatarUrl?: string | null | undefined;
  verified?: boolean;
}

interface BoostStatus {
  active: boolean;
  canBoost: boolean;
  isPremium: boolean;
}

function BoostButton() {
  const { toast } = useToast();
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<BoostStatus>('/api/profile/boost')
      .then(setStatus)
      .catch(() => {
        /* boost pill is non-critical — silently stays hidden on failure */
      });
  }, []);

  async function activate() {
    if (busy) return;
    setBusy(true);
    try {
      await api('/api/profile/boost', { method: 'POST' });
      toast('Ton profil est boosté pour 30 minutes !', 'success');
      setStatus((s) => (s ? { ...s, active: true, canBoost: s.isPremium } : s));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BOOST_COOLDOWN_ACTIVE') {
        toast('Ton prochain boost gratuit revient dans 24h — ou passe Premium.', 'error');
      } else {
        toast('Impossible de lancer le boost pour le moment.', 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <button
      type="button"
      onClick={() => void activate()}
      disabled={busy || status.active}
      aria-label="Booster mon profil"
      className={`relative flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-body text-sm font-medium transition-colors ${
        status.active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:border-primary/40'
      } ${busy ? 'opacity-50' : ''}`}
    >
      <Icon name="zap" size={15} />
      {status.active ? 'En avant' : 'Boost'}
    </button>
  );
}

function AccountMenu({ user }: { user: SidebarUser }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const handleLogout = useCallback(async () => {
    setOpen(false);
    await logout();
    router.push('/login');
  }, [logout, router]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu du compte"
        aria-expanded={open}
        className="flex items-center gap-1.5"
      >
        <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={36} />
        <Icon name="chevron-down" size={14} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="animate-scale-in absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate font-headings text-sm font-semibold text-foreground">
              {user.name}
            </p>
            {user.verified && (
              <div className="mt-1 flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-verified" />
                <span className="font-body text-xs text-muted-foreground">Profil vérifié</span>
              </div>
            )}
          </div>
          <div className="py-1">
            {ACCOUNT_MENU_ITEMS.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 font-body text-sm text-foreground hover:bg-background"
              >
                <Icon name={item.icon} size={16} className="text-muted-foreground" />
                {item.label}
              </Link>
            ))}
          </div>
          <div className="border-t border-border py-1">
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex w-full items-center gap-3 px-4 py-2.5 font-body text-sm text-foreground hover:bg-background"
            >
              <Icon name="log-out" size={16} className="text-muted-foreground" />
              Se déconnecter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TopNav({
  active,
  user,
  badgeCounts,
}: {
  active: SidebarTab;
  user: SidebarUser;
  badgeCounts?: SidebarBadgeCounts | undefined;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      {/* Desktop / tablet bar (md+) */}
      <div className="mx-auto hidden max-w-7xl items-center justify-between gap-4 px-6 py-3 md:flex lg:px-8">
        <Link href="/app/decouvrir" className="flex flex-shrink-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <span className="font-headings text-base font-bold text-primary-foreground">Y</span>
          </div>
          <span className="hidden font-headings text-xl font-bold text-foreground lg:inline">
            YeOyo
          </span>
        </Link>

        <nav className="flex flex-1 items-center justify-center gap-1">
          {TOPNAV_ITEMS.map((item) => {
            const isActive = item.id === active;
            const badge = badgeFor(item.id, badgeCounts);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`relative flex flex-col items-center gap-0.5 rounded-md px-3 py-2 font-body text-xs font-medium lg:px-4 ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Icon name={item.icon} size={18} />
                <span className="hidden lg:inline">{item.label}</span>
                {!!badge && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-body text-[10px] font-bold text-primary-foreground">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </Link>
            );
          })}
          <Link
            href={PREMIUM_ITEM.href}
            className="flex flex-col items-center gap-0.5 rounded-md px-3 py-2 font-body text-xs font-medium text-gold lg:px-4"
          >
            <Icon name={PREMIUM_ITEM.icon} size={18} />
            <span className="hidden lg:inline">{PREMIUM_ITEM.label}</span>
          </Link>
        </nav>

        <div className="flex flex-shrink-0 items-center gap-3">
          <BoostButton />
          <Link
            href="/app/messages"
            aria-label="Messages"
            className={`relative ${active === 'messages' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <Icon name="message-circle" size={22} />
            {!!badgeFor('messages', badgeCounts) && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary font-body text-[10px] font-bold text-primary-foreground">
                {(badgeCounts?.messages ?? 0) > 9 ? '9+' : badgeCounts?.messages}
              </span>
            )}
          </Link>
          <NotificationBell />
          <AccountMenu user={user} />
        </div>
      </div>

      {/* Mobile top strip — MobileTabBar.tsx carries the 5 primary tabs
          below `md`, so this only surfaces what wouldn't fit there. */}
      <div className="flex items-center justify-between px-4 py-3 md:hidden">
        <Link href="/app/decouvrir" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <span className="font-headings text-base font-bold text-primary-foreground">Y</span>
          </div>
          <span className="font-headings text-lg font-bold text-foreground">YeOyo</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/app/messages"
            aria-label="Messages"
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground"
          >
            <Icon name="message-circle" size={17} />
            {!!badgeFor('messages', badgeCounts) && (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary" />
            )}
          </Link>
          <NotificationBell />
          <Link href="/app/profil" aria-label="Mon profil">
            <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={32} />
          </Link>
        </div>
      </div>
    </header>
  );
}
