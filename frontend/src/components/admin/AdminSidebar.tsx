'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

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
  items: { href: string; label: string; badge?: number | undefined }[];
}

export function AdminSidebar({
  adminEmail,
  reportsCount,
  verificationCount,
  open,
  onClose,
}: {
  adminEmail: string;
  reportsCount?: number | undefined;
  verificationCount?: number | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  const groups: NavGroup[] = [
    { label: '', items: [{ href: '/admin', label: 'Dashboard' }] },
    {
      label: 'Utilisateurs',
      items: [
        { href: '/admin/membres', label: 'Membres' },
        { href: '/admin/verification', label: 'Vérification IA', badge: verificationCount },
        { href: '/admin/signalements', label: 'Signalements', badge: reportsCount },
      ],
    },
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
        <span className="font-headings text-lg font-bold text-foreground">YeOyo Admin</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le menu"
          className="text-muted-foreground lg:hidden"
        >
          <Icon name="x" size={20} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label || 'root'}>
            {group.label && (
              <p className="px-3 pb-1 font-body text-xs uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 font-body text-sm ${
                    active ? 'bg-secondary text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <span>{item.label}</span>
                  {!!item.badge && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}

        {inertGroups.map((group) => (
          <div key={group.label + group.items.join()}>
            <p className="px-3 pb-1 font-body text-xs uppercase tracking-widest text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((label) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-lg px-3 py-2 font-body text-sm text-muted-foreground/50"
              >
                <span>{label}</span>
                <span className="text-xs italic">Bientôt</span>
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-4">
        <p className="truncate font-body text-xs text-muted-foreground">{adminEmail}</p>
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
