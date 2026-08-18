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
  Messages: 'message-circle',
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
  open,
  onClose,
}: {
  adminEmail: string;
  role: 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';
  reportsCount?: number | undefined;
  verificationCount?: number | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const groups: NavGroup[] = [
    { label: '', items: [{ href: '/admin', label: 'Dashboard', icon: 'layout-grid' }] },
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
          icon: 'shield',
          badge: reportsCount,
        },
      ],
    },
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
    { label: 'Finance', items: ['Abonnements', 'Transactions'] },
    { label: 'Système', items: ['Configuration', 'Logs'] },
  ];

  const content = (
    <>
      <div className="flex items-center justify-between border-b border-border px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Icon name="shield-check" size={16} />
          </span>
          <span className="font-headings text-lg font-bold leading-none text-foreground">
            YeOyo Admin
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le menu"
          className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground lg:hidden"
        >
          <Icon name="x" size={20} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group.label || 'root'}>
            {group.label && (
              <p className="px-3 pb-1.5 font-body text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
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
                    className={`group relative flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 font-body text-sm transition-colors ${
                      active
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {active && (
                      <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                    )}
                    <Icon
                      name={item.icon}
                      size={17}
                      className={active ? 'text-primary' : 'text-muted-foreground/80'}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {!!item.badge && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold leading-none text-primary-foreground">
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
            <p className="px-3 pb-1.5 font-body text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((label) => (
                <div
                  key={label}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 font-body text-sm text-muted-foreground/40"
                >
                  <Icon name={INERT_ICONS[label] ?? 'lock'} size={17} />
                  <span className="flex-1 truncate">{label}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] italic">
                    Bientôt
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-border px-4 py-4">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted font-body text-xs font-semibold text-foreground">
          {adminEmail.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-body text-xs font-medium text-foreground">{adminEmail}</p>
          <p className="font-body text-[11px] capitalize text-muted-foreground">
            {role.toLowerCase()}
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop/tablet-landscape: permanent sidebar */}
      <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-border bg-surface lg:flex">
        {content}
      </aside>

      {/* Mobile/tablet: off-canvas drawer + backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-surface transition-transform duration-200 lg:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {content}
      </aside>
    </>
  );
}
