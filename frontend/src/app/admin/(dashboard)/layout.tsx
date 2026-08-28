// /admin/(dashboard)/* shell — gates every authenticated admin route
// behind GET /api/admin/me (403 ADMIN_REQUIRED → redirect to
// /admin/login). Lives in the (dashboard) route group so /admin/login
// itself stays outside this guard (see /admin/login/layout.tsx).
// Mirrors the pattern from examples/frontend-pages/admin/layout.tsx,
// restyled with the app's dark/gold theme (see AdminSidebar.tsx for why
// — the Banani export's separate admin color tokens were never
// actually defined).
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { Icon } from '@/components/ui/Icon';

interface AdminMe {
  admin: { id: string; email: string; role: 'MODERATOR' | 'ADMIN' | 'SUPERADMIN' };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminMe['admin'] | null>(null);
  const [checked, setChecked] = useState(false);
  const [reportsCount, setReportsCount] = useState<number | undefined>(undefined);
  const [verificationCount, setVerificationCount] = useState<number | undefined>(undefined);
  const [supportCount, setSupportCount] = useState<number | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<AdminMe>('/api/admin/me');
        if (cancelled) return;
        setAdmin(res.admin);
        const [reports, verification, support] = await Promise.all([
          api<{ total: number }>('/api/admin/reports?status=PENDING&limit=1'),
          api<{ total: number }>('/api/admin/verification-queue?limit=1'),
          api<{ unreadThreads: number }>('/api/admin/support?limit=1'),
        ]);
        if (!cancelled) {
          setReportsCount(reports.total);
          setVerificationCount(verification.total);
          setSupportCount(support.unreadThreads);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) router.replace('/admin/login');
          else router.replace('/admin/login');
        }
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!checked || !admin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background font-body text-sm text-muted-foreground">
        Vérification des accès…
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-background font-body">
      <AdminSidebar
        adminEmail={admin.email}
        role={admin.role as 'MODERATOR' | 'ADMIN' | 'SUPERADMIN'}
        reportsCount={reportsCount}
        verificationCount={verificationCount}
        supportCount={supportCount}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <div className="flex-1 overflow-x-hidden">
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-4 backdrop-blur-sm md:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Ouvrir le menu"
              className="cursor-pointer text-foreground lg:hidden"
            >
              <Icon name="menu" size={20} />
            </button>
            <span className="rounded-full bg-secondary px-2.5 py-1 font-body text-xs font-semibold text-secondary-foreground">
              {admin.role === 'SUPERADMIN'
                ? 'Super Admin'
                : admin.role === 'ADMIN'
                  ? 'Admin'
                  : 'Modérateur'}
            </span>
          </div>
          <Link
            href="/app/decouvrir"
            className="flex cursor-pointer items-center gap-1.5 font-body text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icon name="arrow-right" size={13} className="rotate-180" />
            Retour à l’application
          </Link>
        </div>
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
