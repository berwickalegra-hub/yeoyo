'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';

interface AdminInviteRow {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export default function AdminRolesPage() {
  const [invites, setInvites] = useState<AdminInviteRow[]>([]);
  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MODERATOR');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [invitesRes, usersRes] = await Promise.all([
      api<{ items: AdminInviteRow[] }>('/api/admin/invites?limit=50'),
      api<{ items: AdminUserRow[] }>('/api/admin/users?role=MODERATOR&limit=50'),
    ]);
    setInvites(invitesRes.items);
    setAdmins(usersRes.items);
  }

  useEffect(() => {
    void load();
  }, []);

  async function sendInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/api/admin/invites', { method: 'POST', body: JSON.stringify({ email, role }) });
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de l'invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await api(`/api/admin/invites/${id}/revoke`, { method: 'POST' });
    await load();
  }

  async function changeRole(userId: string, newRole: string) {
    await api(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: newRole }),
    });
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-headings text-2xl font-bold text-foreground">Gestion des rôles admin</h1>

      <form
        onSubmit={sendInvite}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4"
      >
        <div className="flex flex-col gap-1">
          <label className="font-body text-xs text-muted-foreground">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-body text-xs text-muted-foreground">Rôle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
          >
            <option value="MODERATOR">Modérateur</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPERADMIN">Super Admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Inviter
        </button>
        {error && <p className="font-body text-sm text-destructive">{error}</p>}
      </form>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-3 font-headings text-sm font-bold text-foreground">Invitations</h2>
        <div className="flex flex-col gap-2">
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between font-body text-xs">
              <span className="text-foreground">{inv.email}</span>
              <span className="text-muted-foreground">{inv.role}</span>
              <span className="text-muted-foreground">
                {inv.acceptedAt ? 'Acceptée' : inv.revokedAt ? 'Révoquée' : 'En attente'}
              </span>
              {!inv.acceptedAt && !inv.revokedAt && (
                <button onClick={() => void revoke(inv.id)} className="text-destructive underline">
                  Révoquer
                </button>
              )}
            </div>
          ))}
          {invites.length === 0 && (
            <p className="font-body text-xs text-muted-foreground">Aucune invitation.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-3 font-headings text-sm font-bold text-foreground">Modérateurs</h2>
        <div className="flex flex-col gap-2">
          {admins.map((a) => (
            <div key={a.id} className="flex items-center justify-between font-body text-xs">
              <span className="text-foreground">{a.name ?? a.email}</span>
              <select
                defaultValue={a.role}
                onChange={(e) => void changeRole(a.id, e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
              >
                <option value="USER">Utilisateur</option>
                <option value="MODERATOR">Modérateur</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPERADMIN">Super Admin</option>
              </select>
            </div>
          ))}
          {admins.length === 0 && (
            <p className="font-body text-xs text-muted-foreground">Aucun modérateur.</p>
          )}
        </div>
      </div>
    </div>
  );
}
