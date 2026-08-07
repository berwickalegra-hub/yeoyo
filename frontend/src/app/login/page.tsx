// Login — not a Banani-designed screen (no "Login" screen was ever
// exported; the flow only designs first-time signup). Built functionally
// so `useUser()`'s default redirect target exists for every authenticated
// app/* page, styled with the app's dark/gold theme but without the design
// polish of the Banani-sourced screens — revisit if/when a login mockup
// is added to the Banani project.
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/app/decouvrir');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 bg-background px-4 font-body">
      <h1 className="font-headings text-2xl font-bold text-foreground">Se connecter</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 font-body text-sm text-foreground">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-2 font-body text-sm text-foreground">
          Mot de passe
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground"
          />
        </label>
        {error && (
          <p role="alert" className="font-body text-sm text-red-500">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p className="font-body text-sm text-muted-foreground">
        Pas encore de compte ?{' '}
        <Link href="/onboarding" className="text-primary underline">
          Créer un profil
        </Link>
      </p>
    </main>
  );
}
