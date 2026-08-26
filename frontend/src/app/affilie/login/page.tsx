'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export default function AffiliateLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Same login route every account type uses — only the account's
      // `role` determines what it can subsequently reach; there is no
      // separate affiliate auth system.
      await api('/api/auth/login', { method: 'POST', body: { email, password } });
      router.push('/affilie');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-6"
    >
      <h1 className="font-headings text-lg font-bold text-foreground">Espace Affilié YeOyo</h1>
      <input
        type="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Mot de passe"
        className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
      />
      {error && <p className="font-body text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        Se connecter
      </button>
    </form>
  );
}
