'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/Icon';

// Reconciled from the Banani `AdminSidebar.jsx` nav structure (Dashboard;
// Utilisateurs → Membres/Vérification IA/Signalements/Suspensions;
// Activité → Likes & Matches/Messages/Demandes; Finance → Abonnements/
// Transactions; Système → Configuration/Logs). Only Dashboard, Membres,
// Vérification IA, and Signalements are actually built for Phase F — the
// rest render as inert labels ("Bientôt") rather than dead links.
//
// Admin theme colors: the Banani export references a separate
// `--color-admin-*` token namespace throughout AdminSidebar/dashboard, but
// those hex values were never present in either fetch (only referenced).
// Per the fallback documented in STATUS.md, this reuses the main app's
// existing `--color-*` tokens instead of inventing new ones.
//
// Dark-green sidebar (2026-08-20, user-reported drift — "la couleur verte
// [...] ne reflète pas vraiment ce qui est sur Banani"): the `AdminDashboard.jsx`
// re-fetch's sidebar is `bg-secondary` (this theme's dark green, #1f3a2e)
// with white (`text-secondary-foreground`) nav text — this component had
// drifted to a light `bg-surface` sidebar with `text-muted-foreground` nav
// text, losing that contrast entirely. Restyled to match: dark-green aside,
// active items get a translucent white wash (`bg-secondary-foreground/15`,
// Banani's own `bg-opacity-15` value), inactive items are white at 60%
// opacity (Banani's `opacity-60`), matching both the desktop rail and the
// mobile drawer (same shared `content` JSX).
//
// Responsive treatment: Banani's own `AdminSidebar.jsx` is a fixed `w-56`
// permanent sidebar with zero responsive classes (confirmed by re-fetching
// the selected designs — see STATUS.md's responsive-design pass entry).
// Nav items here have no icons (text-only), so an icon-only tablet rail
// like the consumer Sidebar.tsx isn't practical without inventing icons
// for every item. Instead: permanent sidebar from `lg` up, an off-canvas
// drawer (toggled by a hamburger button in admin/layout.tsx's top bar)
// below `lg` — the standard pattern for admin dashboards that are
// desktop-first but shouldn't be unusable on a tablet/phone.
interface NavGroup {
  label: string;
  items: { href: string; label: string; icon: IconName; badge?: number | undefined }[];
}

// Icon per inert (not-yet-built) nav label — kept in its own map since these
// items aren't real NavGroup entries (no href, never active).
const INERT_ICONS: Record<string, IconName> = {
  Suspensions: 'ban',
  'Likes & Matches': 'heart',
  Messages: 'message-square',
  Demandes: 'user-plus',
  Abonnements: 'crown',
  Transactions: 'credit-card',
  Configuration: 'settings',
  Logs: 'layers',
};

export function AdminSidebar({
  adminEmail,
  role,
  reportsCount,
  verificationCount,
  supportCount,
  open,
  onClose,
}: {
  adminEmail: string;
  role: 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';
  reportsCount?: number | undefined;
  verificationCount?: number | undefined;
  supportCount?: number | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const groups: NavGroup[] = [
    { label: '', items: [{ href: '/admin', label: 'Dashboard', icon: 'layout-dashboard' }] },
    {
      label: 'Utilisateurs',
      items: [
        ...(role !== 'MODERATOR'
          ? [{ href: '/admin/membres', label: 'Membres', icon: 'users' as IconName }]
          : []),
        {
          href: '/admin/verification',
          label: 'Vérification IA',
          icon: 'bot',
          badge: verificationCount,
        },
        {
          href: '/admin/signalements',
          label: 'Signalements',
          icon: 'flag',
          badge: reportsCount,
        },
        {
          href: '/admin/support',
          label: 'Support',
          icon: 'life-buoy',
          badge: supportCount,
        },
      ],
    },
    // ADMIN+ (not MODERATOR) — read-only back-office listings whose APIs
    // (GET /api/admin/orders, /api/admin/audit-log) are requireAdmin('ADMIN').
    ...(role !== 'MODERATOR'
      ? [
          {
            label: 'Finance',
            items: [
              { href: '/admin/transactions', label: 'Transactions', icon: 'banknote' as IconName },
              ...(role === 'SUPERADMIN'
                ? [{ href: '/admin/affilies', label: 'Affiliés', icon: 'users' as IconName }]
                : []),
            ],
          },
          {
            label: 'Système',
            items: [
              { href: '/admin/journal', label: "Journal d'activité", icon: 'layers' as IconName },
            ],
          },
        ]
      : []),
    ...(role === 'SUPERADMIN'
      ? [
          {
            label: 'Administration',
            items: [
              { href: '/admin/roles', label: 'Rôles admin', icon: 'shield-check' as IconName },
              {
                href: '/admin/2fa-setup',
                label: 'Authentification à deux facteurs',
                icon: 'smartphone' as IconName,
              },
            ],
          },
        ]
      : []),
  ];

  const inertGroups = [
    { label: 'Utilisateurs', items: ['Suspensions'] },
    { label: 'Activité', items: ['Likes & Matches', 'Messages', 'Demandes'] },
    { label: 'Finance', items: ['Abonnements'] },
    { label: 'Système', items: ['Configuration'] },
  ];

  const content = (
    <>
      <div className="flex items-center justify-between border-b border-secondary-foreground/10 px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="relative h-4 w-6 flex-shrink-0">
            <span className="absolute left-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-primary" />
            <span className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-secondary-foreground opacity-60" />
          </span>
          <span className="font-headings text-base font-bold leading-none text-secondary-foreground">
            YeOyo
          </span>
          <span className="ml-auto rounded px-1.5 py-0.5 font-body text-xs font-bold text-primary-foreground bg-primary">
            Admin
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le menu"
          className="cursor-pointer text-secondary-foreground/60 transition-colors hover:text-secondary-foreground lg:hidden"
        >
          <Icon name="x" size={20} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group.label || 'root'}>
            {group.label && (
              <p className="px-3 pb-1.5 font-body text-[11px] font-semibold uppercase tracking-widest text-secondary-foreground/50">
                {group.label}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 font-body text-sm font-medium transition-colors ${
                      active
                        ? 'bg-secondary-foreground/15 text-secondary-foreground'
                        : 'text-secondary-foreground/60 hover:bg-secondary-foreground/10 hover:text-secondary-foreground'
                    }`}
                  >
                    <Icon name={item.icon} size={16} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {!!item.badge && (
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold leading-none text-primary-foreground">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {inertGroups.map((group) => (
          <div key={group.label + group.items.join()}>
            <p className="px-3 pb-1.5 font-body text-[11px] font-semibold uppercase tracking-widest text-secondary-foreground/50">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((label) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 font-body text-sm text-secondary-foreground/30"
                >
                  <Icon name={INERT_ICONS[label] ?? 'lock'} size={16} />
                  <span className="flex-1 truncate">{label}</span>
                  <span className="rounded-full bg-secondary-foreground/10 px-1.5 py-0.5 text-[10px] italic">
                    Bientôt
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-secondary-foreground/10 px-4 py-4">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary font-body text-xs font-bold text-primary-foreground">
          {adminEmail.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-body text-xs font-bold text-secondary-foreground">
            {adminEmail}
          </p>
          <p className="font-body text-[11px] capitalize text-secondary-foreground/50">
            {role.toLowerCase()}
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop/tablet-landscape: permanent sidebar */}
      <aside className="hidden w-60 flex-shrink-0 flex-col bg-secondary lg:flex">{content}</aside>

      {/* Mobile/tablet: off-canvas drawer + backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-secondary transition-transform duration-200 lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {content}
      </aside>
    </>
  );
}
