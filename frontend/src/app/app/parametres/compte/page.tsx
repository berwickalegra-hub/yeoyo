'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SettingsSubHeader } from '@/components/yeoyo/SettingsSubHeader';
import { SettingsSection, SettingsRow } from '@/components/yeoyo/SettingsSection';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';

export default function ComptePage() {
  const user = useUser();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();

  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ profile: { verifiedAt: string | null } }>('/api/profile');
      setVerifiedAt(res.profile.verifiedAt);
    } catch {
      /* profile may not exist yet — verification status simply shows "non vérifié" */
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/api/auth/change-password', {
        method: 'PUT',
        body: { currentPassword, newPassword },
      });
      toast('Mot de passe mis à jour', 'success');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <AppShell active="parametres" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <SettingsSubHeader title="Compte" subtitle="Email, vérification et mot de passe" />
      <div className="flex flex-col gap-4 px-5 py-6 lg:mx-auto lg:max-w-3xl lg:px-8">
        <SettingsSection title="Informations">
          <SettingsRow label="Adresse email" helper={user.email}>
            <span className="font-body text-xs text-muted-foreground">Non modifiable</span>
          </SettingsRow>
          <SettingsRow
            label="Statut de vérification"
            helper={
              verifiedAt
                ? `Vérifié le ${new Date(verifiedAt).toLocaleDateString('fr-FR')}`
                : 'Non vérifié'
            }
          >
            <span className={`h-2 w-2 rounded-full ${verifiedAt ? 'bg-verified' : 'bg-muted'}`} />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Changer le mot de passe">
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <input
              type="password"
              placeholder="Mot de passe actuel"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
            />
            <input
              type="password"
              placeholder="Nouveau mot de passe"
              required
              minLength={10}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
            />
            <button
              type="submit"
              disabled={submitting}
              className="mt-1 self-start rounded-lg bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? 'Changement…' : 'Changer'}
            </button>
          </form>
        </SettingsSection>
      </div>
    </AppShell>
  );
}
