// /affilie/(dashboard)/* shell — gates every affiliate route behind
// GET /api/affiliate/me (403 AFFILIATE_REQUIRED → redirect to
// /affilie/login). Lives in the (dashboard) group so /affilie/login
// itself stays outside this guard.
//
// 2026-08-28 (explicit user ask): the guard fetch now also feeds a shared
// top bar — brand + "Espace Affilié" on the left, an account chip with a
// log-out menu on the right — shown on every affiliate page.
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { BrandMark } from '@/components/yeoyo/BrandMark';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Icon } from '@/components/ui/Icon';

interface AffiliateIdentity {
  affiliateCode: string;
  email: string;
  name: string | null;
}

export default function AffiliateLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [checked, setChecked] = useState(false);
  const [identity, setIdentity] = useState<AffiliateIdentity | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await api<AffiliateIdentity>('/api/affiliate/me');
        if (!cancelled) setIdentity(me);
      } catch (err) {
        if (!cancelled) {
          void err; // AFFILIATE_REQUIRED (403) or unauthenticated (401) — same redirect either way
          router.replace('/affilie/login');
        }
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    await logout();
    router.replace('/affilie/login');
  }

  if (!checked || !identity) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background font-body text-sm text-muted-foreground">
        Vérification des accès…
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <BrandMark className="h-7 w-auto" />
            <span className="font-headings text-base font-bold text-foreground">
              Espace Affilié
            </span>
          </div>
          <AccountMenu identity={identity} onLogout={handleLogout} />
        </div>
      </header>

      <div className="p-4 md:p-6 lg:p-8">{children}</div>
    </div>
  );
}

function AccountMenu({
  identity,
  onLogout,
}: {
  identity: AffiliateIdentity;
  onLogout: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const label = identity.name ?? identity.email;

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
        aria-label="Menu du compte"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2.5 transition-colors hover:bg-muted"
      >
        <UserAvatar name={label} size={28} />
        <span className="hidden max-w-[10rem] truncate font-body text-sm text-foreground sm:inline">
          {label}
        </span>
        <Icon name="chevron-down" size={14} className="text-muted-foreground" />
      </button>

      {open && (
        <div className="animate-scale-in absolute right-0 top-11 z-50 w-64 origin-top-right overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-3">
            <UserAvatar name={label} size={38} />
            <div className="min-w-0">
              {identity.name && (
                <p className="truncate font-headings text-sm font-semibold text-foreground">
                  {identity.name}
                </p>
              )}
              <p className="truncate font-body text-xs text-muted-foreground">{identity.email}</p>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="font-body text-xs text-muted-foreground">Code affilié</span>
            <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
              {identity.affiliateCode}
            </span>
          </div>

          <div className="border-t border-border p-1.5">
            <button
              type="button"
              disabled={loggingOut}
              onClick={async () => {
                setLoggingOut(true);
                await onLogout();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 font-body text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                <Icon
                  name={loggingOut ? 'refresh-cw' : 'log-out'}
                  size={15}
                  className={loggingOut ? 'animate-spin' : 'text-muted-foreground'}
                />
              </span>
              {loggingOut ? 'Déconnexion…' : 'Se déconnecter'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
