'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { SidebarBadgeCounts } from '@/components/yeoyo/nav-items';

// Fetched once per page mount — good enough for a sidebar badge (not
// wired to Ably; a new message/request only updates the badge on next
// navigation or refresh, same as most inbox badges).
export function useNavCounts(): SidebarBadgeCounts {
  const { user: authUser, loading: authLoading } = useAuth();
  const authReady = !authLoading && !!authUser;
  const [counts, setCounts] = useState<SidebarBadgeCounts>({});

  useEffect(() => {
    // Wait for AuthProvider's own /api/auth/me to resolve first — firing
    // this in parallel with it 401s in lockstep whenever the access token
    // has already expired (e.g. reopening the app after 15+ min); the
    // api() wrapper silently refreshes and retries, but the first failed
    // request still logs to the console — 2026-08-30, explicit user report
    // of 401 noise on Découvrir.
    if (!authReady) return;
    let cancelled = false;
    api<{ demandes: number; messages: number }>('/api/app/nav-counts')
      .then((res) => {
        if (!cancelled) setCounts({ demandes: res.demandes, messages: res.messages });
      })
      .catch(() => {
        /* badge counts are non-critical — silently keep {} on failure */
      });
    return () => {
      cancelled = true;
    };
  }, [authReady]);

  return counts;
}
