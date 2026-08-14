// Login — styled to match the rest of the site (AuthShell gives it the
// same branded logo-home-link + card treatment as forgot/reset-password)
// after having shipped for a while as a bare functional form with no
// design pass (no Banani "Login" screen was ever exported — the flow
// only designs first-time signup).
//
// "Continuer avec Google" (2026-08-14, explicit user ask) — plain `<a>` to
// GET /api/auth/oauth/google/start?next=/app/decouvrir, not a client-side
// handler: the OAuth dance is a full-page redirect to Google, so there is
// nothing for React to intercept. The button is always rendered (matching
// examples/frontend-pages/login.tsx's own pattern) — if a fork hasn't set
// GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI, the route just 404s per google.ts's
// conditional-boot design; this project has them configured.
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { AuthShell } from '@/components/yeoyo/AuthShell';
import { PasswordInput } from '@/components/yeoyo/PasswordInput';
import { GoogleIcon } from '@/components/ui/GoogleIcon';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const justReset = params.get('reset') === 'ok';

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
    <AuthShell
      title="Content de te revoir"
      subtitle="Connecte-toi pour continuer ta recherche."
      footer={
        <p className="font-body text-sm text-muted-foreground">
          Pas encore de compte ?{' '}
          <Link
            href="/onboarding"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Créer un profil
          </Link>
        </p>
      }
    >
      {justReset && (
        <p className="mb-4 rounded-lg border border-verified/30 bg-verified/10 px-4 py-2.5 font-body text-sm text-verified">
          Mot de passe mis à jour — connecte-toi avec ton nouveau mot de passe.
        </p>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label
          htmlFor="login-email"
          className="flex flex-col gap-2 font-body text-sm text-foreground"
        >
          Email
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground transition-colors focus:border-primary focus:outline-none"
          />
        </label>
        <label
          htmlFor="login-password"
          className="flex flex-col gap-2 font-body text-sm text-foreground"
        >
          <span className="flex items-center justify-between">
            Mot de passe
            <Link
              href="/forgot-password"
              className="font-body text-xs font-medium text-primary hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </span>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
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
          className="mt-2 rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
        >
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <div className="my-1 flex items-center gap-3 font-body text-xs uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

      <a
        href="/api/auth/oauth/google/start?next=/app/decouvrir"
        className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface py-3.5 font-body text-sm font-medium text-foreground transition-colors hover:bg-background"
      >
        <GoogleIcon />
        Continuer avec Google
      </a>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
