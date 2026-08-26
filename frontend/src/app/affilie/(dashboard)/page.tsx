'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';

interface AffiliateMe {
  affiliateCode: string;
  referralUrl: string;
  counters: { totalSignups: number; verifiedMen: number; verifiedWomen: number };
  earnings: {
    total: number;
    pending: number;
    paid: number;
    verificationBonusTotal: number;
    commissionTotal: number;
  };
  lastPaidAt: string | null;
  referredUsers: {
    firstName: string | null;
    verificationStatus: string | null;
    totalEarned: number;
  }[];
}

function formatFcfa(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

export default function AffiliateDashboardPage() {
  const { toast } = useToast();
  const [data, setData] = useState<AffiliateMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api<AffiliateMe>('/api/affiliate/me');
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled)
          toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  async function copyLink() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Impossible de copier le lien', 'error');
    }
  }

  if (loading || !data) {
    return <p className="font-body text-sm text-muted-foreground">Chargement…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-headings text-2xl font-bold text-foreground">Mon espace affilié</h1>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <p className="font-body text-sm text-muted-foreground">
          Ton code et ton lien de parrainage
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-primary/10 px-3 py-2 font-mono text-sm font-semibold text-primary">
            {data.affiliateCode}
          </span>
          <code className="flex-1 truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
            {data.referralUrl}
          </code>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="btn-press flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 font-body text-xs font-semibold text-primary-foreground"
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
            {copied ? 'Copié' : 'Copier le lien'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="font-body text-xs text-muted-foreground">Inscriptions totales</p>
          <p className="font-headings text-2xl font-bold text-foreground">
            {data.counters.totalSignups}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="font-body text-xs text-muted-foreground">Hommes vérifiés</p>
          <p className="font-headings text-2xl font-bold text-foreground">
            {data.counters.verifiedMen}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="font-body text-xs text-muted-foreground">Femmes vérifiées</p>
          <p className="font-headings text-2xl font-bold text-foreground">
            {data.counters.verifiedWomen}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-3 font-body text-sm font-semibold text-foreground">Gains</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="font-body text-xs text-muted-foreground">Total gagné</p>
            <p className="font-headings text-xl font-bold text-foreground">
              {formatFcfa(data.earnings.total)}
            </p>
          </div>
          <div>
            <p className="font-body text-xs text-muted-foreground">En attente de versement</p>
            <p className="font-headings text-xl font-bold text-gold">
              {formatFcfa(data.earnings.pending)}
            </p>
          </div>
          <div>
            <p className="font-body text-xs text-muted-foreground">Déjà versé</p>
            <p className="font-headings text-xl font-bold text-verified">
              {formatFcfa(data.earnings.paid)}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-4 border-t border-border pt-3 font-body text-xs text-muted-foreground">
          <span>Primes de vérification : {formatFcfa(data.earnings.verificationBonusTotal)}</span>
          <span>Commissions crédits : {formatFcfa(data.earnings.commissionTotal)}</span>
        </div>
        {data.lastPaidAt && (
          <p className="mt-2 font-body text-xs text-muted-foreground">
            Dernier versement : {new Date(data.lastPaidAt).toLocaleDateString('fr-FR')}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-3 font-body text-sm font-semibold text-foreground">Mes filleuls</p>
        {data.referredUsers.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">Aucun filleul pour le moment.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.referredUsers.map((u, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <div>
                  <p className="font-body text-sm text-foreground">
                    {u.firstName ?? 'Sans profil'}
                  </p>
                  <p className="font-body text-xs text-muted-foreground">
                    {u.verificationStatus ?? '—'}
                  </p>
                </div>
                <span className="font-body text-sm font-semibold text-foreground">
                  {formatFcfa(u.totalEarned)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
