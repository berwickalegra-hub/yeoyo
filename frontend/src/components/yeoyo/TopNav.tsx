'use client';

// Desktop-first horizontal top navigation, replacing Sidebar.tsx per the
// "Rencontres Sérieuses Congo" Banani re-theme (2026-08-13) — reproduces
// Banani's TopNav.jsx (logo, 5 primary tabs, Boost button, Messages
// icon+badge, notification bell, avatar dropdown).
// Banani only exported a desktop bar; the `md:hidden` block below is this
// session's own compact mobile top strip (logo + credits badge + messages +
// bell + avatar link — no dropdown, kept deliberately light since the 5
// primary tabs move to MobileTabBar.tsx's bottom bar on mobile and Boost is
// also reachable from the Accueil dashboard).
// 2026-08-25: the gold "Premium" tab was replaced by a persistent credits
// balance badge (id 'credits', see nav-items.ts's CREDITS_ITEM) — the
// recurring subscription is gone in favor of a pay-per-use credit system
// (see lib/server/credits/ledger.ts).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useCredits } from '@/contexts/CreditsContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Modal } from '@/components/ui/Modal';
import { CreditConfirmModal } from './CreditConfirmModal';
import { BrandMark } from './BrandMark';
import { NotificationBell } from './NotificationBell';
import { useIsAdmin } from '@/lib/yeoyo/useIsAdmin';
import {
  TOPNAV_ITEMS,
  CREDITS_ITEM,
  ACCOUNT_MENU_ITEMS,
  SETTINGS_MENU_ITEMS,
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
  boostedUntil: string | null;
  cost: number;
}

function BoostButton() {
  const { toast } = useToast();
  const { balance, unlimited, refresh: refreshCredits } = useCredits();
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    api<BoostStatus>('/api/profile/boost')
      .then(setStatus)
      .catch(() => {
        /* boost pill is non-critical — silently stays hidden on failure */
      });
  }, []);

  async function activate() {
    if (busy || !status) return;
    setBusy(true);
    try {
      await api('/api/profile/boost', { method: 'POST' });
      toast('Ton profil est boosté pour 24h !', 'success');
      setStatus((s) => (s ? { ...s, active: true } : s));
      setShowConfirm(false);
      void refreshCredits();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_CREDITS') {
        toast('Solde de crédits insuffisant pour booster ton profil.', 'error');
      } else {
        toast('Impossible de lancer le boost pour le moment.', 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  function requestBoost() {
    if (!status || status.active || busy) return;
    if (unlimited) {
      void activate();
      return;
    }
    setShowConfirm(true);
  }

  if (!status) return null;

  return (
    <>
      <button
        type="button"
        onClick={requestBoost}
        disabled={busy || status.active}
        aria-label={`Booster mon profil — ${status.cost} crédits`}
        className={`relative flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-body text-sm font-medium transition-colors ${
          status.active
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:border-primary/40'
        } ${busy ? 'opacity-50' : ''}`}
      >
        <Icon name="zap" size={15} />
        {status.active ? 'En avant' : `Boost · ${status.cost}`}
      </button>

      <CreditConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        cost={status.cost}
        balance={balance}
        actionLabel="Booster ton profil pendant 24h"
        onConfirm={activate}
        confirming={busy}
      />
    </>
  );
}

// Desktop counterpart to MobileTabBar's ActivityTab (2026-08-17, explicit
// user ask; revised 2026-08-20) — the "Activité" tab opens Favoris +
// Visiteurs in a dropdown instead of linking straight to /app/visiteurs.
// Messages moved out to its own primary tab (see TOPNAV_ITEMS) since a
// submenu didn't give chat enough visibility; desktop still keeps a
// dedicated Messages icon in the top-right cluster too.
function ActivityNavItem({ active }: { active: SidebarTab }) {
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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Activité — Favoris et Visiteurs"
        aria-expanded={open}
        className={`relative flex flex-col items-center gap-0.5 rounded-md px-3 py-2 font-body text-xs font-medium lg:px-4 ${
          isActive ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Icon name="menu" size={18} />
        <span className="hidden lg:inline">Activité</span>
      </button>

      {open && (
        <div className="animate-scale-in absolute left-1/2 top-11 z-50 w-56 -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface p-2 shadow-2xl">
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

function AccountMenu({ user }: { user: SidebarUser }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  // Logout now asks for confirmation (2026-08-17, explicit user ask) —
  // a stray tap on "Se déconnecter" used to log the user out immediately.
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Direct shortcut to the back-office for admin/superadmin accounts
  // (2026-08-17, explicit user ask) — sits next to the avatar itself, not
  // buried in the dropdown, since the whole point is a one-tap jump.
  const isAdmin = useIsAdmin();
  const { balance, unlimited } = useCredits();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const handleLogout = useCallback(async () => {
    setConfirmingLogout(false);
    setOpen(false);
    await logout();
    router.push('/login');
  }, [logout, router]);

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      {isAdmin && (
        <Link
          href="/admin"
          aria-label="Aller au panneau administrateur"
          title="Panneau administrateur"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-gold/40 text-gold transition-transform active:scale-95"
        >
          <Icon name="shield" size={16} />
        </Link>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu du compte"
        aria-expanded={open}
        className="flex items-center gap-1.5"
      >
        <UserAvatar
          name={user.name}
          avatarUrl={user.avatarUrl}
          size={36}
          className="avatar-ring border-2 border-transparent"
        />
        <Icon name="chevron-down" size={14} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="animate-scale-in absolute right-0 top-11 z-50 max-h-[75vh] w-64 origin-top-right overflow-y-auto rounded-2xl border border-border bg-surface shadow-2xl">
          <div className="sticky top-0 flex items-center gap-3 border-b border-border bg-muted/60 px-4 py-3.5">
            <UserAvatar
              name={user.name}
              avatarUrl={user.avatarUrl}
              size={44}
              className="border-2 border-surface"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate font-headings text-sm font-semibold text-foreground">
                  {user.name}
                </p>
                <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 font-body text-[10px] font-bold text-gold">
                  <Icon name="gem" size={10} />
                  {unlimited ? 'Illimité' : `${balance} crédit${balance > 1 ? 's' : ''}`}
                </span>
              </div>
              {user.verified && (
                <div className="mt-0.5 flex items-center gap-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-verified" />
                  <span className="font-body text-xs text-muted-foreground">Profil vérifié</span>
                </div>
              )}
            </div>
          </div>

          <p className="px-4 pb-1 pt-3 font-body text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
            Compte
          </p>
          <div className="px-2 pb-1">
            {ACCOUNT_MENU_ITEMS.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-2.5 py-2 font-body text-sm text-foreground transition-colors hover:bg-muted"
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon name={item.icon} size={15} className="text-muted-foreground" />
                </span>
                {item.label}
              </Link>
            ))}
          </div>

          <p className="border-t border-border px-4 pb-1 pt-3 font-body text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
            Paramètres
          </p>
          <div className="px-2 pb-1">
            {SETTINGS_MENU_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-2.5 py-2 font-body text-sm text-foreground transition-colors hover:bg-muted"
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon name={item.icon} size={15} className="text-muted-foreground" />
                </span>
                {item.label}
              </Link>
            ))}
          </div>

          <div className="border-t border-border px-2 py-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirmingLogout(true);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 font-body text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon name="log-out" size={15} className="text-muted-foreground" />
              </span>
              Se déconnecter
            </button>
          </div>
        </div>
      )}

      <Modal open={confirmingLogout} onClose={() => setConfirmingLogout(false)}>
        <div className="flex flex-col items-center gap-4 text-center">
          {/* Logout is reversible (just sign back in), not destructive like
              a delete — alarm-red belongs to actions that lose data, so this
              uses the app's own accent/foreground tones instead of a stock
              red, matching the rest of the design system (2026-08-19,
              explicit user ask for a more "pro" dialog here). */}
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
            <Icon name="log-out" size={22} className="text-accent-foreground" />
          </div>
          <div>
            <p className="font-headings text-base font-bold text-foreground">Se déconnecter ?</p>
            <p className="mt-1.5 font-body text-sm text-muted-foreground">
              Tu devras te reconnecter pour accéder à ton compte.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex h-11 items-center justify-center rounded-full bg-foreground font-body text-sm font-semibold text-background transition-transform active:scale-95"
            >
              Se déconnecter
            </button>
            <button
              type="button"
              onClick={() => setConfirmingLogout(false)}
              className="flex h-11 items-center justify-center rounded-full border border-border font-body text-sm font-medium text-muted-foreground transition-transform active:scale-95"
            >
              Annuler
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function TopNav({
  active,
  user,
  badgeCounts,
  hideMobileStrip = false,
}: {
  active: SidebarTab;
  user: SidebarUser;
  badgeCounts?: SidebarBadgeCounts | undefined;
  /** Explorer only (2026-08-19, explicit user ask) — the mobile top strip
   * eats vertical space the swipe card needs to fit on-screen without
   * scrolling. Desktop's bar is never affected (it isn't cramped there). */
  hideMobileStrip?: boolean;
}) {
  const { balance, unlimited, loading: creditsLoading } = useCredits();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      {/* Desktop / tablet bar (md+) */}
      <div className="mx-auto hidden max-w-7xl items-center justify-between gap-4 px-6 py-3 md:flex lg:px-8">
        <Link href="/app/decouvrir" className="flex flex-shrink-0 items-center gap-2">
          <BrandMark className="h-8 w-auto" />
          <span className="hidden font-headings text-xl font-bold text-foreground lg:inline">
            YeOyo
          </span>
        </Link>

        <nav className="flex flex-1 items-center justify-center gap-1">
          {TOPNAV_ITEMS.map((item) => {
            const isActive = item.id === active;
            const badge = badgeFor(item.id, badgeCounts);

            // Découvrir is the app's primary action — permanently emphasized
            // via a filled-primary icon circle (not just on `isActive`),
            // the desktop counterpart to MobileTabBar's raised FAB circle.
            if (item.id === 'decouvrir') {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex flex-col items-center gap-0.5 rounded-md px-3 py-2 font-body text-xs font-medium text-primary lg:px-4"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary shadow-md shadow-primary/30">
                    <Icon name={item.icon} size={16} className="text-primary-foreground" />
                  </span>
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            }

            if (item.id === 'visiteurs') {
              return <ActivityNavItem key={item.id} active={active} />;
            }

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
            href={CREDITS_ITEM.href}
            aria-label={unlimited ? 'Crédits illimités' : `Crédits — solde de ${balance}`}
            className={`relative flex flex-col items-center gap-0.5 rounded-md px-3 py-2 font-body text-xs font-medium lg:px-4 ${
              active === 'credits' ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon name={CREDITS_ITEM.icon} size={18} />
            <span className="hidden lg:inline">{CREDITS_ITEM.label}</span>
            {!creditsLoading && (
              <span className="absolute -right-1.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 font-body text-[10px] font-bold text-gold-foreground">
                {unlimited ? '∞' : balance > 99 ? '99+' : balance}
              </span>
            )}
          </Link>
        </nav>

        <div className="flex flex-shrink-0 items-center gap-3">
          <BoostButton />
          <Link
            href="/app/messages"
            aria-label="Messages"
            className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              active === 'messages'
                ? 'bg-gold/15 text-gold'
                : 'text-gold/80 hover:bg-gold/10 hover:text-gold'
            }`}
          >
            <Icon name="message-circle" size={20} />
            {!!badgeFor('messages', badgeCounts) && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary font-body text-[10px] font-bold text-primary-foreground">
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
      {!hideMobileStrip && (
        <div className="flex items-center justify-between px-4 py-3 md:hidden">
          <Link href="/app/decouvrir" className="flex items-center gap-2">
            <BrandMark className="h-8 w-auto" />
            <span className="font-headings text-lg font-bold text-foreground">YeOyo</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={CREDITS_ITEM.href}
              aria-label={unlimited ? 'Crédits illimités' : `Crédits — solde de ${balance}`}
              className="flex h-9 items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 text-gold"
            >
              <Icon name={CREDITS_ITEM.icon} size={14} />
              {!creditsLoading && (
                <span className="font-body text-xs font-bold">
                  {unlimited ? '∞' : balance > 99 ? '99+' : balance}
                </span>
              )}
            </Link>
            <Link
              href="/app/messages"
              aria-label="Messages"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold"
            >
              <Icon name="message-circle" size={17} />
              {!!badgeFor('messages', badgeCounts) && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary" />
              )}
            </Link>
            <NotificationBell />
            <AccountMenu user={user} />
          </div>
        </div>
      )}
    </header>
  );
}
