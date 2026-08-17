// Login — same model as the onboarding wizard's signup step (2026-08-14,
// explicit user spec): Google is the privileged, visually-dominant path
// (solid border, full width, first); email/password is the secondary path
// below a divider, with muted labels instead of the Google button's
// full-strength styling. AuthShell still gives it the shared branded
// header + card treatment as forgot/reset-password.
//
// "Continuer avec Google" — plain `<a>` to
// GET /api/auth/oauth/google/start?next=/app/decouvrir, not a client-side
// handler: the OAuth dance is a full-page redirect to Google, so there is
// nothing for React to intercept. `googleRedirecting` only drives the
// button's own spinner while the browser navigates away.
//
// Smart post-login redirect: a session can exist without a Profile row yet
// (e.g. someone who verified their email or linked Google, then closed the
// tab before finishing onboarding) — GET /api/profile 404s in that case, so
// we route to /onboarding (which itself auto-advances to the profile-wizard
// step, see that page's "returning user" effect) instead of dumping them
// into the app shell where every profile-dependent route would 404.
//
// Error message: INVALID_CREDENTIALS from the API is already generic
// ("Invalid email or password", not "wrong password") for enumeration
// resistance — mapped to French here since the API's own copy is English
// and every other string on this page is French.
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { looksLikeEmail } from '@/lib/utils';
import { AuthShell } from '@/components/yeoyo/AuthShell';
import { PasswordInput } from '@/components/yeoyo/PasswordInput';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { Icon } from '@/components/ui/Icon';

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email ou mot de passe incorrect.',
  LOCKED_OUT: 'Compte temporairement verrouillé suite à plusieurs échecs. Réessaie plus tard.',
  EMAIL_NOT_VERIFIED: 'Merci de vérifier ton email avant de te connecter.',
  ACCOUNT_SUSPENDED: 'Ce compte a été suspendu. Contacte le support.',
  TOO_MANY_LOGIN_ATTEMPTS: 'Trop de tentatives. Réessaie dans quelques minutes.',
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleRedirecting, setGoogleRedirecting] = useState(false);
  const justReset = params.get('reset') === 'ok';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailError(null);
    setPasswordError(null);

    let hasError = false;
    if (!looksLikeEmail(email)) {
      setEmailError('Merci de saisir une adresse email valide.');
      hasError = true;
    }
    if (!password) {
      setPasswordError('Merci de saisir ton mot de passe.');
      hasError = true;
    }
    if (hasError) return;

    setSubmitting(true);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      try {
        await api('/api/profile');
        router.push('/app/decouvrir');
      } catch {
        router.push('/onboarding');
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? (LOGIN_ERROR_MESSAGES[err.code] ?? err.message)
          : 'Une erreur est survenue. Réessaie.';
      setError(msg);
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
            Créer un compte
          </Link>
        </p>
      }
    >
      {justReset && (
        <p className="mb-4 rounded-lg border border-verified/30 bg-verified/10 px-4 py-2.5 font-body text-sm text-verified">
          Mot de passe mis à jour — connecte-toi avec ton nouveau mot de passe.
        </p>
      )}

      {/* Google — the privileged path, full width and visually dominant
          (solid border, own row), same treatment as the signup step. */}
      <a
        href="/api/auth/oauth/google/start?next=/app/decouvrir"
        onClick={() => setGoogleRedirecting(true)}
        aria-disabled={googleRedirecting}
        className="flex items-center justify-center gap-2 rounded-xl border-2 border-foreground/15 bg-surface py-3.5 font-body text-sm font-semibold text-foreground transition-colors hover:bg-background"
      >
        {googleRedirecting ? (
          <Icon name="refresh-cw" size={17} className="animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Continuer avec Google
      </a>

      <div className="my-5 flex items-center gap-3 font-body text-xs uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* Email form — secondary path: same functional weight, lighter
          visual weight (muted labels, no card/shadow) than Google above. */}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <label
          htmlFor="login-email"
          className="flex flex-col gap-2 font-body text-sm text-muted-foreground"
        >
          Email
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            aria-invalid={!!emailError}
            className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {emailError && (
            <span role="alert" className="font-body text-xs text-red-500">
              {emailError}
            </span>
          )}
        </label>
        <label
          htmlFor="login-password"
          className="flex flex-col gap-2 font-body text-sm text-muted-foreground"
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
            onChange={(v) => {
              setPassword(v);
              if (passwordError) setPasswordError(null);
            }}
            autoComplete="current-password"
          />
          {passwordError && (
            <span role="alert" className="font-body text-xs text-red-500">
              {passwordError}
            </span>
          )}
        </label>
        {error && (
          <p role="alert" className="font-body text-sm text-red-500">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
        >
          {submitting && <Icon name="refresh-cw" size={16} className="animate-spin" />}
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
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
