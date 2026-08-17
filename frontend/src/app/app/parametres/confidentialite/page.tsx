'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth, useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SettingsSubHeader } from '@/components/yeoyo/SettingsSubHeader';
import { SettingsSection, SettingsRow } from '@/components/yeoyo/SettingsSection';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';

interface BlockedRow {
  userId: string;
  profile: { firstName: string; photoUrl: string | null };
}

export default function ConfidentialitePage() {
  const user = useUser();
  const { logout } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const badgeCounts = useNavCounts();
  const [blocked, setBlocked] = useState<BlockedRow[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api<{ blocked: BlockedRow[] }>('/api/users/blocked');
      setBlocked(res.blocked);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }, [toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function unblock(userId: string) {
    try {
      await api(`/api/users/${userId}/block`, { method: 'DELETE' });
      setBlocked((prev) => prev.filter((b) => b.userId !== userId));
      toast('Utilisateur débloqué', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  async function downloadData() {
    try {
      const data = await api<Record<string, unknown>>('/api/account/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'yeoyo-mes-donnees.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  if (!user) return null;

  return (
    <AppShell
      active="parametres"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <SettingsSubHeader
        title="Confidentialité"
        subtitle="Utilisateurs bloqués, tes données, ton compte"
      />
      <div className="flex flex-col gap-4 px-5 py-6 lg:mx-auto lg:max-w-3xl lg:px-8">
        <SettingsSection title="Utilisateurs bloqués">
          {blocked.length === 0 && (
            <p className="font-body text-sm text-muted-foreground">Aucun utilisateur bloqué.</p>
          )}
          {blocked.map((b) => (
            <div key={b.userId} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <UserAvatar name={b.profile.firstName} avatarUrl={b.profile.photoUrl} size={32} />
                <span className="font-body text-sm text-foreground">{b.profile.firstName}</span>
              </div>
              <button
                type="button"
                onClick={() => unblock(b.userId)}
                className="rounded-lg border border-border bg-background px-3 py-1.5 font-body text-xs font-medium text-muted-foreground"
              >
                Débloquer
              </button>
            </div>
          ))}
        </SettingsSection>

        <SettingsSection title="Données et confidentialité">
          <SettingsRow label="Télécharger mes données" helper="Export JSON de ton compte">
            <button
              type="button"
              onClick={downloadData}
              className="rounded-lg border border-border bg-background px-4 py-2 font-body text-sm font-medium text-foreground"
            >
              Télécharger
            </button>
          </SettingsRow>
          <DeleteAccountRow
            hasPassword={user.hasPassword}
            userEmail={user.email}
            onDeleted={async () => {
              await logout();
              router.push('/');
            }}
          />
        </SettingsSection>
      </div>
    </AppShell>
  );
}

function DeleteAccountRow({
  hasPassword,
  userEmail,
  onDeleted,
}: {
  hasPassword: boolean;
  userEmail: string;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function confirmDelete() {
    setSubmitting(true);
    try {
      await api('/api/account', {
        method: 'DELETE',
        body: hasPassword ? { password: input } : { confirmEmail: input },
      });
      onDeleted();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!confirming) {
    return (
      <SettingsRow
        label="Supprimer mon compte"
        helper="Suppression définitive — pas de retour possible"
      >
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-red-500 px-4 py-2 font-body text-sm font-medium text-red-500"
        >
          Supprimer
        </button>
      </SettingsRow>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
      <p className="font-body text-xs text-muted-foreground">
        {hasPassword
          ? 'Confirme ton mot de passe pour supprimer définitivement ton compte.'
          : `Retape ton email (${userEmail}) pour confirmer la suppression définitive.`}
      </p>
      <input
        type={hasPassword ? 'password' : 'text'}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={hasPassword ? 'Mot de passe' : userEmail}
        className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-border px-3 py-1.5 font-body text-xs text-muted-foreground"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={confirmDelete}
          disabled={submitting || !input}
          className="rounded-lg bg-red-500 px-3 py-1.5 font-body text-xs font-semibold text-white disabled:opacity-50"
        >
          Confirmer la suppression
        </button>
      </div>
    </div>
  );
}
