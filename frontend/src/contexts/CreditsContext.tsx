'use client';

// Exposes the logged-in user's credit balance app-wide (2026-08-25, replaces
// PremiumContext.tsx) so any screen can show it — the header badge, a
// pre-spend confirmation modal — without each re-fetching /api/credits/me
// itself. No more `data-premium` html attribute: a credit balance is
// private (like a wallet), not a public status the whole theme reacts to.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface SavedPhone {
  phone: string;
  phoneCountry: string;
}

interface CreditsMeResponse {
  balance: number;
  unlimited: boolean;
  savedPhone: SavedPhone | null;
}

interface CreditsContextValue {
  balance: number;
  unlimited: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextValue | null>(null);

export function CreditsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [unlimited, setUnlimited] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setBalance(0);
      setUnlimited(false);
      setLoading(false);
      return;
    }
    try {
      const res = await api<CreditsMeResponse>('/api/credits/me');
      setBalance(res.balance);
      setUnlimited(res.unlimited);
    } catch {
      // Transient failure — keep the last known balance rather than
      // flashing 0 credits on a network blip.
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
    // Only re-fetch when the logged-in user identity changes; `refresh`
    // itself is stable per-user via useCallback's `user` dependency.
  }, [refresh]);

  return (
    <CreditsContext.Provider value={{ balance, unlimited, loading, refresh }}>
      {children}
    </CreditsContext.Provider>
  );
}

const SSR_STUB: CreditsContextValue = {
  balance: 0,
  unlimited: false,
  loading: true,
  refresh: async () => {},
};

export function useCredits(): CreditsContextValue {
  const ctx = useContext(CreditsContext);
  if (!ctx) {
    if (typeof window === 'undefined') return SSR_STUB;
    throw new Error('useCredits must be used inside a CreditsProvider');
  }
  return ctx;
}
