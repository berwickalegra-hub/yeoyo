'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SettingsSubHeader } from '@/components/yeoyo/SettingsSubHeader';
import { SettingsSection } from '@/components/yeoyo/SettingsSection';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { KINSHASA_COMMUNES, INTENT_OPTIONS } from '@/lib/yeoyo/constants';

const INTERESTED_IN_OPTIONS = [
  { value: 'FEMME', label: 'Femmes' },
  { value: 'HOMME', label: 'Hommes' },
  { value: 'TOUS', label: 'Les deux' },
];

interface ProfileSettings {
  interestedIn: string | null;
  commune: string | null;
  intent: string;
}

export default function PreferencesPage() {
  const user = useUser();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const [profile, setProfile] = useState<ProfileSettings | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ profile: ProfileSettings }>('/api/profile');
      setProfile(res.profile);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }, [toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function patchProfile(patch: Partial<ProfileSettings>) {
    if (!profile) return;
    const previous = profile;
    setProfile({ ...profile, ...patch });
    try {
      await api('/api/profile', { method: 'PATCH', body: patch });
    } catch (err) {
      setProfile(previous);
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  if (!user) return null;

  return (
    <AppShell active="parametres" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <SettingsSubHeader
        title="Préférences de recherche"
        subtitle="Qui tu souhaites voir dans Découvrir et Explorer"
      />
      {!profile ? null : (
        <div className="flex flex-col gap-4 px-5 py-6 lg:mx-auto lg:max-w-3xl lg:px-8">
          <SettingsSection title="Préférences de recherche">
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">
                Je souhaite voir
              </span>
              <select
                value={profile.interestedIn ?? ''}
                onChange={(e) => patchProfile({ interestedIn: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Par défaut (sexe opposé)</option>
                {INTERESTED_IN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Localité</span>
              <select
                value={profile.commune ?? ''}
                onChange={(e) => patchProfile({ commune: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Tout Kinshasa</option>
                {KINSHASA_COMMUNES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Intention</span>
              <select
                value={profile.intent}
                onChange={(e) => patchProfile({ intent: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                {INTENT_OPTIONS.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>
          </SettingsSection>
        </div>
      )}
    </AppShell>
  );
}
