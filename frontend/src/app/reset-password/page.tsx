// Reads `?email=` and `?code=` from the URL (the reset email links here
// with both pre-filled). No auto-login on success — password reset bumps
// tokenVersion to invalidate any stolen sessions, so the user re-enters
// their new password on /login instead.
'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AuthShell } from '@/components/yeoyo/AuthShell';
import { PasswordInput } from '@/components/yeoyo/PasswordInput';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: { email, code, newPassword },
      });
      router.push('/login?reset=ok');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOO_MANY_RESET_ATTEMPTS') {
        setError('Trop de tentatives. Réessaie dans 10 minutes.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Code invalide ou expiré');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Réinitialiser ton mot de passe"
      subtitle="Entre le code reçu par email et choisis un nouveau mot de passe."
      footer={
        <Link href="/login" className="font-body text-sm text-primary hover:underline">
          Retour à la connexion
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label htmlFor="rp-email" className="flex flex-col gap-2 font-body text-sm text-foreground">
          Email
          <input
            id="rp-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground transition-colors focus:border-primary focus:outline-none"
          />
        </label>
        <label htmlFor="rp-code" className="flex flex-col gap-2 font-body text-sm text-foreground">
          Code de réinitialisation
          <input
            id="rp-code"
            type="text"
            required
            maxLength={8}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="rounded-lg border border-border bg-surface px-4 py-3 font-mono text-sm uppercase tracking-widest text-foreground transition-colors focus:border-primary focus:outline-none"
          />
        </label>
        <label
          htmlFor="rp-new-password"
          className="flex flex-col gap-2 font-body text-sm text-foreground"
        >
          Nouveau mot de passe
          <PasswordInput
            id="rp-new-password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            minLength={10}
          />
          <span className="font-body text-xs text-muted-foreground">Au moins 10 caractères.</span>
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
          {submitting ? 'Réinitialisation…' : 'Réinitialiser le mot de passe'}
        </button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
