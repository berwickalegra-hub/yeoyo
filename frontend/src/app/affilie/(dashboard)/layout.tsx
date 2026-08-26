// /affilie/(dashboard)/* shell — gates every affiliate route behind
// GET /api/affiliate/me (403 AFFILIATE_REQUIRED → redirect to
// /affilie/login). Lives in the (dashboard) group so /affilie/login
// itself stays outside this guard.
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function AffiliateLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await api('/api/affiliate/me');
        if (!cancelled) setOk(true);
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

  if (!checked || !ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background font-body text-sm text-muted-foreground">
        Vérification des accès…
      </main>
    );
  }

  return <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">{children}</div>;
}
