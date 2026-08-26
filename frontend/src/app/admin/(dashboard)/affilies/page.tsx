// Admin — Affiliés. SUPERADMIN-only (enforced server-side by every route
// this page calls; the sidebar link itself is also SUPERADMIN-gated, see
// AdminSidebar.tsx). Lists affiliates with their currently-owed balance,
// lets an admin create a new affiliate account (reuses the AdminInvite
// email flow) and mark an affiliate's full balance as paid.
'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { AdminTableSkeleton } from '@/components/yeoyo/AdminTableSkeleton';

interface AffiliateRow {
  id: string;
  email: string;
  name: string | null;
  affiliateCode: string | null;
  createdAt: string;
  amountOwed: number;
  lastPaidAt: string | null;
}

function formatFcfa(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} FCFA`;
}

export default function AdminAffiliesPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: AffiliateRow[] }>('/api/admin/affiliates?limit=50');
      setItems(res.items);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createAffiliate(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !name.trim()) {
      toast('Email et nom requis', 'error');
      return;
    }
    setCreating(true);
    try {
      await api('/api/admin/affiliates', { method: 'POST', body: { email, name } });
      toast('Invitation envoyée', 'success');
      setEmail('');
      setName('');
      void load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function markPaid(id: string) {
    setMarkingId(id);
    try {
      const res = await api<{ amount: number; count: number }>(
        `/api/admin/affiliates/${id}/mark-paid`,
        { method: 'POST' },
      );
      toast(`${formatFcfa(res.amount)} marqué(s) comme versé(s)`, 'success');
      void load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-headings text-2xl font-bold text-foreground">Affiliés</h1>

      <form
        onSubmit={createAffiliate}
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-end"
      >
        <label className="flex flex-1 flex-col gap-1 font-body text-xs text-muted-foreground">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 font-body text-xs text-muted-foreground">
          Nom
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {creating ? 'Envoi…' : 'Inviter un affilié'}
        </button>
      </form>

      {loading ? (
        <AdminTableSkeleton rows={4} columns={5} />
      ) : (
        <div className="animate-fade-in overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left font-body text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Dû</th>
                <th className="px-4 py-3 font-medium">Dernier versement</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-foreground">{a.name ?? a.email}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {a.affiliateCode ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">
                      {formatFcfa(a.amountOwed)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {a.lastPaidAt ? new Date(a.lastPaidAt).toLocaleDateString('fr-FR') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={a.amountOwed === 0 || markingId === a.id}
                      onClick={() => void markPaid(a.id)}
                      className="btn-press rounded-lg border border-border px-3 py-1 font-body text-xs text-primary disabled:opacity-50"
                    >
                      {markingId === a.id ? 'Marquage…' : 'Marquer comme payé'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && items.length === 0 && (
        <p className="font-body text-sm text-muted-foreground">Aucun affilié pour le moment.</p>
      )}
    </div>
  );
}
