// GET ?token=<raw invite token>, sent by the outbox invite email
// (see api/admin/invites/route.ts's `inviteUrl`). Sets the invitee's
// password via POST /api/admin/invites/accept, then sends them to log in —
// this route never issues cookies itself (mirrors reset-password's
// no-auto-login rationale: keep the invite-accept and login flows
// independent). The accept response carries the invite's `role`: an
// AFFILIATE account goes to /affilie/login (it fails /api/admin/login's
// `roleRank(role) >= roleRank('MODERATOR')` gate), everyone else goes to
// /admin/login as before.
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

function AcceptInviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; role?: string }>('/api/admin/invites/accept', {
        method: 'POST',
        body: { token, password },
      });
      setDone(true);
      router.push(res.role === 'AFFILIATE' ? '/affilie/login' : '/admin/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Échec de l'activation du compte.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-6">
        <h1 className="font-headings text-lg font-bold text-foreground">Lien invalide</h1>
        <p className="font-body text-sm text-muted-foreground">
          Ce lien d'invitation est incomplet. Demande un nouveau lien à un administrateur.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-6">
        <h1 className="font-headings text-lg font-bold text-foreground">Compte activé</h1>
        <p className="font-body text-sm text-muted-foreground">Redirection vers la connexion…</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-6"
    >
      <h1 className="font-headings text-lg font-bold text-foreground">Activer mon compte admin</h1>
      <p className="font-body text-sm text-muted-foreground">
        Choisis un mot de passe pour accéder au back-office YeOyo.
      </p>
      <input
        type="password"
        autoFocus
        required
        minLength={10}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Nouveau mot de passe"
        className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
      />
      {error && <p className="font-body text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        Activer
      </button>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}
