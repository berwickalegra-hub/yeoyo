// Paramètres — index of settings categories. Used to be one long page with
// all 9 sections and every field expanded at once (a continuous scroll of
// toggles, selects and textareas). Split into a short list of rows here,
// each drilling into its own sub-page under /app/parametres/<section> (see
// SettingsSubHeader.tsx) — much less to scan before finding the setting you
// actually came for.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth, useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SettingsNavRow } from '@/components/yeoyo/SettingsSection';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Icon } from '@/components/ui/Icon';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';

interface ProfileSummary {
  firstName: string;
  photoUrl: string | null;
}

export default function ParametresPage() {
  const user = useUser();
  const { logout } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const badgeCounts = useNavCounts();
  const [profile, setProfile] = useState<ProfileSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ profile: ProfileSummary }>('/api/profile');
      setProfile(res.profile);
    } catch (err) {
      // No profile yet (onboarding incomplete) is expected, not an error —
      // only surface a toast for genuine failures.
      if (err instanceof ApiError && err.code !== 'PROFILE_NOT_FOUND') {
        toast(err.message, 'error');
      }
    }
  }, [toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!user) return null;

  return (
    <AppShell active="parametres" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <div className="border-b border-border px-5 py-5 lg:px-8">
        <h1 className="font-headings text-xl font-bold text-foreground">Paramètres</h1>
        <p className="mt-0.5 font-body text-sm text-muted-foreground">
          Gérez votre compte et vos préférences
        </p>
      </div>

      <div className="flex flex-col gap-3 px-5 py-6 lg:mx-auto lg:max-w-3xl lg:px-8">
        {profile && (
          <Link
            href="/app/profil"
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition-transform active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <UserAvatar name={profile.firstName} avatarUrl={profile.photoUrl} size={48} />
              <div>
                <p className="font-headings text-sm font-semibold text-foreground">
                  {profile.firstName}
                </p>
                <p className="font-body text-xs text-muted-foreground">
                  Voir mon profil, ajouter une photo
                </p>
              </div>
            </div>
            <Icon name="chevron-right" size={18} className="text-muted-foreground" />
          </Link>
        )}

        <SettingsNavRow
          href="/app/parametres/compte"
          icon="user"
          label="Compte"
          helper="Email, vérification, mot de passe"
        />
        <SettingsNavRow
          href="/app/parametres/profil"
          icon="layers"
          label="Profil"
          helper="Visibilité, bio, qualités, situation familiale"
        />
        <SettingsNavRow
          href="/app/parametres/preferences"
          icon="sliders-horizontal"
          label="Préférences de recherche"
          helper="Qui tu souhaites voir, localité, intention"
        />
        <SettingsNavRow
          href="/app/parametres/notifications"
          icon="bell"
          label="Notifications"
          helper="Demandes, messages, likes, suggestions"
        />
        <SettingsNavRow
          href="/app/parametres/apparence"
          icon="palette"
          label="Apparence"
          helper="Thème sombre, clair, ou autre couleur"
        />
        <SettingsNavRow
          href="/app/parametres/paiement"
          icon="credit-card"
          label="Paiement"
          helper="Ton plan et l'historique des paiements"
        />
        <SettingsNavRow
          href="/app/parametres/confidentialite"
          icon="lock"
          label="Confidentialité"
          helper="Utilisateurs bloqués, tes données, ton compte"
        />
        <SettingsNavRow href="/app/parametres/apropos" icon="info" label="À propos" />

        <button
          type="button"
          onClick={async () => {
            await logout();
            router.push('/');
          }}
          className="mt-2 rounded-xl border border-border bg-surface py-3 font-body text-sm font-medium text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-500"
        >
          Se déconnecter
        </button>
      </div>
    </AppShell>
  );
}
