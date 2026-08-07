// Premium Checkout — pending confirmation. Not a Banani screen (the mockup
// only shows the checkout form itself) — this stands in for whatever a real
// Stripe/Moneroo hosted redirect would show while awaiting confirmation.
// Polls Order/Subscription status; the "Simuler la confirmation" button is
// the stub provider's stand-in for a real webhook (see
// /api/subscriptions/orders/[id]/simulate-payment) and should be the first
// thing removed once a real provider is wired.
'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';

interface OrderStatus {
  orderStatus: string;
  subscriptionStatus: string | null;
}

const POLL_INTERVAL_MS = 4000;

function PendingContent() {
  const user = useUser();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');

  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [simulating, setSimulating] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await api<OrderStatus>(`/api/subscriptions/orders/${orderId}`);
      setStatus(res);
      if (res.orderStatus !== 'PENDING' && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    } catch {
      /* transient poll failure — next tick retries */
    }
  }, [orderId]);

  useEffect(() => {
    void poll();
    intervalRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  useEffect(() => {
    if (status?.orderStatus === 'PAID') {
      toast('Paiement confirmé — bienvenue dans Premium !', 'success');
      router.push('/app/parametres');
    }
  }, [status, router, toast]);

  async function simulatePayment() {
    if (!orderId) return;
    setSimulating(true);
    try {
      await api(`/api/subscriptions/orders/${orderId}/simulate-payment`, { method: 'POST' });
      await poll();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSimulating(false);
    }
  }

  if (!user) return null;

  if (!orderId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 font-body">
        <p className="text-sm text-muted-foreground">Commande introuvable.</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center font-body">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
        <Icon name="smartphone" size={28} className="text-primary" />
      </div>
      <h1 className="font-headings text-xl font-bold text-foreground">
        En attente de confirmation Mobile Money
      </h1>
      <p className="max-w-sm font-body text-sm text-muted-foreground">
        Suis les instructions envoyées sur ton téléphone pour confirmer le paiement. Cette page se
        met à jour automatiquement.
      </p>

      <div className="mt-4 rounded-xl border border-dashed border-border bg-surface p-4">
        <p className="font-body text-xs text-muted-foreground">
          Environnement de démonstration — aucun paiement réel n’est effectué.
        </p>
        <button
          type="button"
          onClick={simulatePayment}
          disabled={simulating}
          className="mt-3 rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {simulating ? 'Confirmation…' : 'Simuler la confirmation du paiement'}
        </button>
      </div>

      <Link
        href="/app/parametres"
        className="mt-2 font-body text-xs text-muted-foreground underline"
      >
        Annuler et revenir aux paramètres
      </Link>
    </main>
  );
}

export default function PremiumPendingPage() {
  return (
    <Suspense fallback={null}>
      <PendingContent />
    </Suspense>
  );
}
