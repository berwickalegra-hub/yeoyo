'use client';

// Lightweight admin probe for conditional UI (2026-08-17, explicit user ask:
// "ajoute une icône... pour permettre à l'admin d'aller direct sur son
// panneau"). Reuses GET /api/admin/me — the existing purpose-built
// capability probe (see its own doc comment: "Front-ends use the can array
// to render conditional UI") — rather than duplicating its locked
// CAPABILITIES_BY_ROLE contract here.
//
// 2026-08-28 fix (explicit user report: a 403 from this probe showed up in
// the browser console/network panel on every page for every regular
// account): /api/auth/me now also returns `role`, so this hook only makes
// the /api/admin/me round-trip for accounts that could plausibly be an
// admin (role !== 'USER') — the common case never fires the request at
// all, so there's nothing left to log. A 403 for a genuinely non-admin role
// (stale session, race with a demotion) is still expected and silent; this
// hook never throws or toasts, it just resolves to false.
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export function useIsAdmin(): boolean {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user || user.role === 'USER') {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    api('/api/admin/me')
      .then(() => {
        if (!cancelled) setIsAdmin(true);
      })
      .catch((err) => {
        if (!cancelled && err instanceof ApiError && err.status !== 403) {
          // Non-403 failure (network blip, 5xx) — stay silent, try again
          // next mount rather than flashing the icon on then off.
          return;
        }
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return isAdmin;
}
