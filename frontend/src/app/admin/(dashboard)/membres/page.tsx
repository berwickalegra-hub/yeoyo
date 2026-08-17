// Admin — Membres. Reuses the existing /api/admin/users (search + cursor
// pagination) and /api/admin/users/[id]/status (suspend/restore) routes
// almost verbatim — this screen needed the least new backend of the whole
// Admin Panel per IMPLEMENTATION-PLAN.md §6.
'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { AdminTableSkeleton } from '@/components/yeoyo/AdminTableSkeleton';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  emailVerifiedAt: string | null;
  createdAt: string;
  isPremium: boolean;
}

export default function AdminMembresPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load(reset: boolean) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (!reset && cursor) params.set('cursor', cursor);
      params.set('limit', '25');
      const res = await api<{ items: AdminUser[]; nextCursor: string | null }>(
        `/api/admin/users?${params.toString()}`,
      );
      setUsers((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
    // Runs once on mount only — `load` intentionally reads the latest
    // `q`/`cursor` via closure rather than being a dependency itself.
  }, []);

  async function toggleStatus(user: AdminUser) {
    const nextStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await api(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus, reason: 'Admin panel action' },
      });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: nextStatus } : u)));
      toast(nextStatus === 'SUSPENDED' ? 'Membre suspendu' : 'Membre restauré', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  // Admin-only test toggle (2026-08-17, explicit user ask): grants/revokes
  // Premium directly on any account, bypassing Chariow checkout entirely —
  // lets the account owner preview the Premium UI without paying. Backed by
  // PATCH /api/admin/users/[id]/premium, which tags the Subscription row
  // provider: 'admin-grant' so it stays distinguishable from a real payment.
  async function togglePremium(user: AdminUser) {
    const nextStatus = user.isPremium ? 'CANCELLED' : 'ACTIVE';
    try {
      await api(`/api/admin/users/${user.id}/premium`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isPremium: nextStatus === 'ACTIVE' } : u)),
      );
      toast(nextStatus === 'ACTIVE' ? 'Premium activé' : 'Premium retiré', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h1 className="font-headings text-2xl font-bold text-foreground">Membres</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load(true);
          }}
          className="flex gap-2"
        >
          <input
            type="search"
            placeholder="Rechercher email ou nom…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-body text-sm text-foreground sm:w-auto sm:flex-initial"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground"
          >
            Rechercher
          </button>
        </form>
      </div>

      {loading && users.length === 0 ? (
        <AdminTableSkeleton rows={6} columns={6} />
      ) : (
        <div className="animate-fade-in overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left font-body text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Rôle</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Premium</th>
                <th className="px-4 py-3 font-medium">Inscrit le</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-foreground">{u.name ?? u.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.status === 'SUSPENDED'
                          ? 'bg-red-500/10 text-red-500'
                          : 'bg-verified/10 text-verified'
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.isPremium && (
                      <span className="rounded-full bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">
                        Premium
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {u.role === 'USER' && (
                        <button
                          type="button"
                          onClick={() => void toggleStatus(u)}
                          className="btn-press rounded-lg border border-border px-3 py-1 font-body text-xs text-muted-foreground"
                        >
                          {u.status === 'ACTIVE' ? 'Suspendre' : 'Restaurer'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void togglePremium(u)}
                        className={`btn-press rounded-lg border px-3 py-1 font-body text-xs ${
                          u.isPremium
                            ? 'border-border text-muted-foreground'
                            : 'border-gold/40 text-gold'
                        }`}
                      >
                        {u.isPremium ? 'Retirer Premium' : 'Activer Premium'}
                      </button>
                    </div>
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

      {!loading && users.length === 0 && (
        <p className="font-body text-sm text-muted-foreground">Aucun membre ne correspond.</p>
      )}
    </div>
  );
}
