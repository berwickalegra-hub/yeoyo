// Admin — Affiliés. SUPERADMIN-only (enforced server-side by every route
// this page calls; the sidebar link itself is also SUPERADMIN-gated, see
// AdminSidebar.tsx). Lists affiliates with their currently-owed balance,
// lets an admin create a new affiliate account (reuses the AdminInvite
// email flow) and mark an affiliate's full balance as paid.
//
// 2026-08-28 design pass (explicit user ask): adopts the Admin Dashboard's
// visual language — header with subtitle, a KPI row (icon tile + figure),
// the invite form as a titled card, and the list inside a `rounded-xl`
// card with a header row, avatar cells, hover rows and an in-card empty
// state. No logic/API change — same calls, same actions as before.
'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { Icon, type IconName } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
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

  const totals = useMemo(() => {
    const owed = items.reduce((sum, a) => sum + a.amountOwed, 0);
    const toPay = items.filter((a) => a.amountOwed > 0).length;
    return { owed, toPay };
  }, [items]);

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
    <div className="animate-fade-in flex flex-col gap-6">
      <div>
        <h1 className="font-headings text-2xl font-bold text-foreground">Affiliés</h1>
        <p className="font-body text-sm text-muted-foreground">
          Programme de parrainage — commissions et versements
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Affiliés"
          value={loading ? '—' : items.length.toLocaleString('fr-FR')}
          icon="users"
          tone="secondary"
        />
        <StatCard
          label="Total dû"
          value={loading ? '—' : formatFcfa(totals.owed)}
          icon="banknote"
          tone="gold"
        />
        <StatCard
          label="À verser"
          value={loading ? '—' : totals.toPay.toLocaleString('fr-FR')}
          icon="credit-card"
          tone="plain"
        />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-4 font-headings text-sm font-bold text-foreground">Nouvel affilié</h2>
        <form onSubmit={createAffiliate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 font-body text-xs text-muted-foreground">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="affilie@exemple.com"
              className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none transition-colors focus:border-primary"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 font-body text-xs text-muted-foreground">
            Nom
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom complet"
              className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground outline-none transition-colors focus:border-primary"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Icon
              name={creating ? 'refresh-cw' : 'user-plus'}
              size={14}
              className={creating ? 'animate-spin' : ''}
            />
            {creating ? 'Envoi…' : 'Inviter un affilié'}
          </button>
        </form>
      </div>

      {loading ? (
        <AdminTableSkeleton rows={4} columns={5} />
      ) : (
        <div className="animate-fade-in overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-headings text-sm font-bold text-foreground">Liste des affiliés</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 font-body text-xs font-medium text-muted-foreground">
              {items.length}
            </span>
          </div>

          {items.length === 0 ? (
            <p className="px-5 py-8 text-center font-body text-sm text-muted-foreground">
              Aucun affilié pour le moment.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                    <th className="px-5 py-2 font-medium">Affilié</th>
                    <th className="px-5 py-2 font-medium">Code</th>
                    <th className="px-5 py-2 font-medium">Dû</th>
                    <th className="px-5 py-2 font-medium">Dernier versement</th>
                    <th className="px-5 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr
                      key={a.id}
                      className="border-t border-border transition-colors hover:bg-muted/40"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={a.name ?? a.email} size={28} />
                          <div className="min-w-0">
                            <p className="truncate text-foreground">{a.name ?? a.email}</p>
                            {a.name && (
                              <p className="truncate font-body text-xs text-muted-foreground">
                                {a.email}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {a.affiliateCode ? (
                          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                            {a.affiliateCode}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            a.amountOwed > 0
                              ? 'bg-gold/10 text-gold'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {formatFcfa(a.amountOwed)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {a.lastPaidAt ? new Date(a.lastPaidAt).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          disabled={a.amountOwed === 0 || markingId === a.id}
                          onClick={() => void markPaid(a.id)}
                          className="btn-press flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 font-body text-xs text-primary transition-colors hover:bg-muted disabled:opacity-40"
                        >
                          <Icon
                            name={markingId === a.id ? 'refresh-cw' : 'check'}
                            size={12}
                            className={markingId === a.id ? 'animate-spin' : ''}
                          />
                          {markingId === a.id ? 'Marquage…' : 'Marquer comme payé'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Local KPI tile — same solid-fill icon-tile pattern as the Admin Dashboard's
// KpiCard (which isn't exported). `plain` keeps its own border so it doesn't
// vanish against the card background.
const STAT_TONES = {
  primary: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  gold: 'bg-gold text-gold-foreground',
  plain: 'bg-card text-foreground border border-border',
} as const;

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: IconName;
  tone: keyof typeof STAT_TONES;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between">
        <p className="font-body text-xs text-muted-foreground">{label}</p>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${STAT_TONES[tone]}`}>
          <Icon name={icon} size={15} />
        </span>
      </div>
      <p className="mt-2 font-headings text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}
