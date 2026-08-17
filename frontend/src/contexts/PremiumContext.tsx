'use client';

// Exposes the logged-in user's Premium status app-wide so any screen can
// react to it (gold avatar ring, nav pip, Paramètres header gradient)
// without re-fetching /api/subscriptions/me itself. Mirrors ThemeContext's
// `data-theme` pattern: sets `data-premium` on <html> so CSS can key off it
// directly, alongside the `usePremium()` hook for JSX-level conditionals.
// Deliberately recomputed on demand from `Subscription.status` rather than a
// denormalized `User.isPremium` flag — keeps webhook handlers (protected)
// untouched and avoids any cache-vs-source-of-truth drift.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface SubscriptionMeResponse {
  subscription: { status: string } | null;
}

interface PremiumContextValue {
  isPremium: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function PremiumProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setIsPremium(false);
      setLoading(false);
      return;
    }
    try {
      const res = await api<SubscriptionMeResponse>('/api/subscriptions/me');
      setIsPremium(res.subscription?.status === 'ACTIVE');
    } catch {
      // Transient failure — keep the last known status rather than flashing
      // the Standard theme on a network blip.
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
    // Only re-fetch when the logged-in user identity changes; `refresh`
    // itself is stable per-user via useCallback's `user` dependency.
  }, [refresh]);

  useEffect(() => {
    if (isPremium) {
      document.documentElement.setAttribute('data-premium', 'true');
    } else {
      document.documentElement.removeAttribute('data-premium');
    }
  }, [isPremium]);

  return (
    <PremiumContext.Provider value={{ isPremium, loading, refresh }}>
      {children}
    </PremiumContext.Provider>
  );
}

const SSR_STUB: PremiumContextValue = {
  isPremium: false,
  loading: true,
  refresh: async () => {},
};

export function usePremium(): PremiumContextValue {
  const ctx = useContext(PremiumContext);
  if (!ctx) {
    if (typeof window === 'undefined') return SSR_STUB;
    throw new Error('usePremium must be used inside a PremiumProvider');
  }
  return ctx;
}
