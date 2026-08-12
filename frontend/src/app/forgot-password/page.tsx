// /forgot-password is enumeration-resistant: the server always returns the
// same response regardless of whether the email is registered. The UI
// mirrors that — show the same confirmation screen on success either way,
// never "no account found for this email".
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { AuthShell } from '@/components/yeoyo/AuthShell';
import { Icon } from '@/components/ui/Icon';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOO_MANY_RESET_REQUESTS') {
        setError('Trop de demandes pour cet email. Réessaie dans une heure.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell
        title="Vérifie ta boîte mail"
        footer={
          <Link href="/login" className="font-body text-sm text-primary hover:underline">
            Retour à la connexion
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-4 text-center lg:items-start lg:text-left">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
            <Icon name="check-circle" size={26} className="text-primary" />
          </div>
          <p className="font-body text-sm leading-relaxed text-muted-foreground">
            Si un compte existe pour <strong className="text-foreground">{email}</strong>, tu
            recevras un code de réinitialisation dans la minute qui suit.
          </p>
          <Link
            href={`/reset-password?email=${encodeURIComponent(email)}`}
            className="font-body text-sm font-medium text-primary hover:underline"
          >
            J&rsquo;ai déjà mon code
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Mot de passe oublié ?"
      subtitle="Indique ton email, on t'envoie un code de réinitialisation."
      footer={
        <p className="font-body text-sm text-muted-foreground">
          Tu t&rsquo;en souviens finalement ?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label htmlFor="fp-email" className="flex flex-col gap-2 font-body text-sm text-foreground">
          Email
          <input
            id="fp-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-border bg-surface px-4 py-3 font-body text-sm text-foreground transition-colors focus:border-primary focus:outline-none"
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
          {submitting ? 'Envoi…' : 'Envoyer le code'}
        </button>
      </form>
    </AuthShell>
  );
}
