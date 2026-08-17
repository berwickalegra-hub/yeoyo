'use client';

// Lightweight admin probe for conditional UI (2026-08-17, explicit user ask:
// "ajoute une icône... pour permettre à l'admin d'aller direct sur son
// panneau"). Reuses GET /api/admin/me — the existing purpose-built
// capability probe (see its own doc comment: "Front-ends use the can array
// to render conditional UI") — instead of threading `role` through the
// consumer-facing /api/auth/me shape. A 403 for non-admins is expected and
// silent; this hook never throws or toasts, it just resolves to false.
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export function useIsAdmin(): boolean {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) {
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
