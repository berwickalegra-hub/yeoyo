// Admin — Transactions / Ventes. ADMIN+ (server-enforced by
// GET /api/admin/orders — requireAdmin('ADMIN'); the sidebar link is
// ADMIN-gated the same way Membres is, see AdminSidebar.tsx).
//
// 2026-08-30 (explicit user ask before launch): the back-office had no
// screen for the list of credit-pack purchases even though the API
// (ADMIN-02) already existed — this fills that gap. Read-only: status
// filter + cursor pagination, no mutations. An Order reaching PAID is what
// grants credits (lib/server/credits/reconcile.ts), so this doubles as the
// revenue view.
'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { AdminTableSkeleton } from '@/components/yeoyo/AdminTableSkeleton';

interface AdminOrder {
  id: string;
  userId: string | null;
  amount: number;
  currency: string;
  status: string;
  customerEmail: string | null;
  provider: string;
  providerChargeId: string | null;
  paymentMethod: string | null;
  paidAt: string | null;
  createdAt: string;
}

const STATUS_FILTERS = ['', 'PAID', 'PENDING', 'FAILED', 'EXPIRED', 'REFUNDED'] as const;

const STATUS_LABEL: Record<string, string> = {
  '': 'Toutes',
  PAID: 'Payées',
  PENDING: 'En attente',
  FAILED: 'Échouées',
  EXPIRED: 'Expirées',
  REFUNDED: 'Remboursées',
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'PAID':
      return 'bg-verified/10 text-verified';
    case 'PENDING':
      return 'bg-gold/10 text-gold';
    case 'REFUNDED':
      return 'bg-secondary/10 text-secondary';
    case 'FAILED':
    case 'EXPIRED':
      return 'bg-red-500/10 text-red-500';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

// XOF/XAF are zero-decimal — the stored `amount` is already the displayable
// figure. USD/EUR would be cents, but every Chariow pack sale on this app is
// XOF, so a plain thousands-separated integer + currency code is correct.
function formatAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString('fr-FR')} ${currency}`;
}

export default function AdminTransactionsPage() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load(reset: boolean, statusOverride?: (typeof STATUS_FILTERS)[number]) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const s = statusOverride ?? status;
      if (s) params.set('status', s);
      if (!reset && cursor) params.set('cursor', cursor);
      params.set('limit', '25');
      const res = await api<{ items: AdminOrder[]; nextCursor: string | null }>(
        `/api/admin/orders?${params.toString()}`,
      );
      setOrders((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Mount only — filter changes call load(true, …) directly; `load` reads
    // the latest `status`/`cursor` via closure rather than being a dep.
    void load(true);
  }, []);

  function pickStatus(s: (typeof STATUS_FILTERS)[number]) {
    setStatus(s);
    setCursor(null);
    void load(true, s);
  }

  const paidTotal = orders.filter((o) => o.status === 'PAID').reduce((sum, o) => sum + o.amount, 0);

  return (
    <div className="animate-fade-in flex flex-col gap-5">
      <div>
        <h1 className="font-headings text-2xl font-bold text-foreground">Transactions</h1>
        <p className="font-body text-sm text-muted-foreground">
          Achats de crédits — paiements Chariow
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="font-body text-xs text-muted-foreground">
            Total encaissé (page affichée, statut « Payées »)
          </p>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold text-gold-foreground">
            <Icon name="banknote" size={15} />
          </span>
        </div>
        <p className="mt-2 font-headings text-2xl font-bold text-foreground">
          {orders.length === 0 ? '—' : formatAmount(paidTotal, orders[0]?.currency ?? 'XOF')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => pickStatus(s)}
            className={`rounded-full border px-3 py-1 font-body text-xs transition-colors ${
              status === s
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loading && orders.length === 0 ? (
        <AdminTableSkeleton rows={6} columns={6} />
      ) : (
        <div className="animate-fade-in overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left font-body text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Montant</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Méthode</th>
                <th className="px-4 py-3 font-medium">Référence</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-foreground">{o.customerEmail ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {formatAmount(o.amount, o.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(o.status)}`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{o.paymentMethod ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {o.providerChargeId ? o.providerChargeId.slice(0, 12) + '…' : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => void load(false)}
          disabled={loading}
          className="self-start rounded-lg border border-border px-4 py-2 font-body text-sm text-muted-foreground disabled:opacity-50"
        >
          {loading ? 'Chargement…' : 'Charger plus'}
        </button>
      )}

      {!loading && orders.length === 0 && (
        <p className="font-body text-sm text-muted-foreground">
          Aucune transaction pour ce filtre.
        </p>
      )}
    </div>
  );
}
