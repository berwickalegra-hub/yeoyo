// Credits Checkout — pending confirmation (2026-08-25, replaces
// app/premium/pending/page.tsx). Shown when the buyer returns from
// Chariow's hosted page (redirect_url) while a real Chariow payment
// settles. Each poll tick calls verify-checkout, which forces a fresh
// reconcileChariowOrder() pull against Chariow rather than reading
// possibly-stale local state — see lib/server/credits/reconcile.ts.
'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useCredits } from '@/contexts/CreditsContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';

interface OrderStatus {
  orderStatus: string;
  creditsGranted: number | null;
}

const POLL_INTERVAL_MS = 4000;
// Hard cap, ~3 minutes. Left uncapped this page would poll for the full
// 30-minute checkout window (~450 requests), and each tick is a real
// outbound Chariow call — enough on its own to trip the shared
// `chariow.api` circuit breaker (5 failures / 30s) and take new checkouts
// down with it. Past the cap the webhook and the safety-net cron still
// confirm the payment; the user just isn't watching it happen.
const MAX_POLL_ATTEMPTS = 45;

function PendingContent() {
  const user = useUser();
  const { refresh: refreshCredits } = useCredits();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');

  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [pollExhausted, setPollExhausted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await api<OrderStatus>(`/api/credits/orders/${orderId}/verify-checkout`, {
        method: 'POST',
      });
      setStatus(res);
      if (res.orderStatus !== 'PENDING') stopPolling();
    } catch {
      /* transient poll failure — next tick retries */
    }
  }, [orderId, stopPolling]);

  useEffect(() => {
    attemptsRef.current = 0;
    setPollExhausted(false);
    void poll();
    intervalRef.current = setInterval(() => {
      attemptsRef.current += 1;
      if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
        stopPolling();
        setPollExhausted(true);
        return;
      }
      void poll();
    }, POLL_INTERVAL_MS);
    return stopPolling;
  }, [poll, stopPolling]);

  useEffect(() => {
    if (status?.orderStatus === 'PAID') {
      void refreshCredits();
      toast(
        `Paiement confirmé — ${status.creditsGranted ?? ''} crédits ajoutés à ton solde !`,
        'success',
      );
      router.push('/app/parametres/paiement');
    }
    if (status?.orderStatus === 'FAILED') {
      toast('Le paiement a échoué ou a été annulé.', 'error');
    }
  }, [status, router, toast, refreshCredits]);

  if (!user) return null;

  if (!orderId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 font-body">
        <p className="text-sm text-muted-foreground">Commande introuvable.</p>
      </main>
    );
  }

  // The checkout link timed out before anything was paid — a dead end that
  // needs its own exit, not the generic "waiting" copy.
  if (status?.orderStatus === 'EXPIRED') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center font-body">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
          <Icon name="smartphone" size={28} className="text-primary" />
        </div>
        <h1 className="font-headings text-xl font-bold text-foreground">Lien de paiement expiré</h1>
        <p className="max-w-sm font-body text-sm text-muted-foreground">
          Le lien de paiement a expiré — réessaie depuis la page Crédits. Si tu as quand même été
          débité, tes crédits seront ajoutés automatiquement dès confirmation.
        </p>
        <Link
          href="/app/credits"
          className="mt-2 rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground"
        >
          Retour aux crédits
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center font-body">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
        <Icon name="smartphone" size={28} className="text-primary" />
      </div>
      <h1 className="font-headings text-xl font-bold text-foreground">
        En attente de confirmation du paiement
      </h1>
      {pollExhausted ? (
        <p className="max-w-sm font-body text-sm text-muted-foreground">
          Toujours en attente. Par Mobile Money, la confirmation peut prendre plus longtemps — tes
          crédits seront ajoutés dès qu&apos;elle arrive. Tu peux fermer cette page sans risque.
        </p>
      ) : (
        <p className="max-w-sm font-body text-sm text-muted-foreground">
          Si tu as payé par Mobile Money, suis les instructions envoyées sur ton téléphone. Cette
          page se met à jour automatiquement.
        </p>
      )}

      <Link
        href="/app/parametres/paiement"
        className="mt-2 font-body text-xs text-muted-foreground underline"
      >
        Annuler et revenir aux paramètres
      </Link>
    </main>
  );
}

export default function CreditsPendingPage() {
  return (
    <Suspense fallback={null}>
      <PendingContent />
    </Suspense>
  );
}
