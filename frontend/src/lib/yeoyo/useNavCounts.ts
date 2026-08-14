'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { SidebarBadgeCounts } from '@/components/yeoyo/nav-items';

// Fetched once per page mount — good enough for a sidebar badge (not
// wired to Ably; a new message/request only updates the badge on next
// navigation or refresh, same as most inbox badges).
export function useNavCounts(): SidebarBadgeCounts {
  const [counts, setCounts] = useState<SidebarBadgeCounts>({});

  useEffect(() => {
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
  }, []);

  return counts;
}
