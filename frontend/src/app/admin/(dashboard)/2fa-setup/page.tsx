'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';

interface SetupResponse {
  qrCodeDataUri: string;
  otpauthUri: string;
  recoveryCodes: string[];
}

export default function TwoFactorSetupPage() {
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setError(null);
    setBusy(true);
    try {
      const res = await api<SetupResponse>('/api/admin/2fa/setup', { method: 'POST' });
      setSetup(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Échec.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/api/admin/2fa/enable', { method: 'POST', body: { code } });
      setEnabled(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Code invalide.');
    } finally {
      setBusy(false);
    }
  }

  if (enabled) {
    return (
      <p className="font-body text-sm text-foreground">Authentification à deux facteurs activée.</p>
    );
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <h1 className="font-headings text-2xl font-bold text-foreground">
        Authentification à deux facteurs
      </h1>

      {error && <p className="font-body text-sm text-destructive">{error}</p>}

      {!setup && (
        <button
          onClick={() => void startSetup()}
          disabled={busy}
          className="btn-press rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Générer un code QR
        </button>
      )}

      {setup && (
        <div className="animate-fade-in-up flex flex-col gap-4">
          <img
            src={setup.qrCodeDataUri}
            alt="Code QR d'authentification"
            width={200}
            height={200}
          />
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="mb-2 font-body text-xs font-semibold text-foreground">
              Codes de récupération (à conserver, affichés une seule fois) :
            </p>
            <ul className="grid grid-cols-2 gap-1 font-body text-xs text-muted-foreground">
              {setup.recoveryCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <form onSubmit={confirmEnable} className="flex flex-col gap-2">
            <label className="font-body text-xs text-muted-foreground">
              Entrez le code affiché par votre application d'authentification pour confirmer :
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
              placeholder="123456"
            />
            <button
              type="submit"
              disabled={busy}
              className="btn-press rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Activer
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
