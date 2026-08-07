// /admin/* shell — gates every admin route behind GET /api/admin/me
// (403 ADMIN_REQUIRED → redirect to /). Mirrors the pattern from
// examples/frontend-pages/admin/layout.tsx, restyled with the app's
// dark/gold theme (see AdminSidebar.tsx for why — the Banani export's
// separate admin color tokens were never actually defined).
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { Icon } from '@/components/ui/Icon';

interface AdminMe {
  admin: { id: string; email: string; role: 'ADMIN' | 'SUPERADMIN' };
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminMe['admin'] | null>(null);
  const [checked, setChecked] = useState(false);
  const [reportsCount, setReportsCount] = useState<number | undefined>(undefined);
  const [verificationCount, setVerificationCount] = useState<number | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<AdminMe>('/api/admin/me');
        if (cancelled) return;
        setAdmin(res.admin);
        const [reports, verification] = await Promise.all([
          api<{ total: number }>('/api/admin/reports?status=PENDING&limit=1'),
          api<{ total: number }>('/api/admin/verification-queue?limit=1'),
        ]);
        if (!cancelled) {
          setReportsCount(reports.total);
          setVerificationCount(verification.total);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) router.replace('/');
          else router.replace('/');
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
        reportsCount={reportsCount}
        verificationCount={verificationCount}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <div className="flex-1 overflow-x-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 md:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Ouvrir le menu"
              className="text-foreground lg:hidden"
            >
              <Icon name="menu" size={20} />
            </button>
            <span className="font-headings text-sm font-semibold text-foreground">
              {admin.role === 'SUPERADMIN' ? 'Super Admin' : 'Admin'}
            </span>
          </div>
          <Link href="/app/decouvrir" className="font-body text-xs text-muted-foreground underline">
            Retour à l’application
          </Link>
        </div>
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
