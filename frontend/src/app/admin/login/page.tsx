'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

type Step = { kind: 'credentials' } | { kind: 'twoFactor'; challengeId: string };

export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ ok?: boolean; twoFactorRequired?: boolean; challengeId?: string }>(
        '/api/admin/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
      );
      if (res.twoFactorRequired && res.challengeId) {
        setStep({ kind: 'twoFactor', challengeId: res.challengeId });
      } else {
        router.push('/admin');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (step.kind !== 'twoFactor') return;
    setError(null);
    setBusy(true);
    try {
      await api('/api/admin/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeId: step.challengeId, code }),
      });
      router.push('/admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code invalide.');
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === 'twoFactor') {
    return (
      <form
        onSubmit={submitCode}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-6"
      >
        <h1 className="font-headings text-lg font-bold text-foreground">Code de vérification</h1>
        <p className="font-body text-sm text-muted-foreground">
          Entrez le code de votre application d'authentification (ou un code de récupération).
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
          placeholder="123456"
        />
        {error && <p className="font-body text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Vérifier
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={submitCredentials}
      className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-6"
    >
      <h1 className="font-headings text-lg font-bold text-foreground">YeOyo Admin</h1>
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
