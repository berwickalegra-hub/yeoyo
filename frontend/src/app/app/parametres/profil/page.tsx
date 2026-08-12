'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SettingsSubHeader } from '@/components/yeoyo/SettingsSubHeader';
import { SettingsSection, SettingsRow } from '@/components/yeoyo/SettingsSection';
import { Toggle } from '@/components/ui/Toggle';
import { SuggestionChips } from '@/components/yeoyo/SuggestionChips';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { RELIGION_LABELS, MARITAL_STATUS_LABELS } from '@/lib/yeoyo/types';
import {
  BIO_SUGGESTIONS,
  QUALITIES_SUGGESTIONS,
  FLAWS_SUGGESTIONS,
  DEALBREAKERS_SUGGESTIONS,
} from '@/lib/yeoyo/content';

const CHILDREN_OPTIONS = [
  { value: '0', label: 'Sans enfant' },
  { value: '1', label: '1 enfant' },
  { value: '2', label: '2 enfants' },
  { value: '3+', label: '3 enfants ou plus' },
];

const WANTS_CHILDREN_OPTIONS = [
  { value: 'OUI', label: 'Oui' },
  { value: 'NON', label: 'Non' },
  { value: 'PEUT_ETRE', label: 'Peut-être' },
];

const RELOCATE_OPTIONS = [
  { value: 'OUI', label: 'Oui' },
  { value: 'NON', label: 'Non' },
  { value: 'A_DISCUTER', label: 'À discuter' },
];

interface ProfileSettings {
  visibilityPublic: boolean;
  onlineStatusVisible: boolean;
  bio: string | null;
  religion: string | null;
  maritalStatus: string | null;
  childrenCount: string | null;
  wantsChildren: string | null;
  relocateOpen: string | null;
  qualities: string | null;
  flaws: string | null;
  dealbreakers: string | null;
}

export default function ProfilParametresPage() {
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
        title="Profil"
        subtitle="Visibilité et informations affichées sur ton profil"
      />
      {!profile ? null : (
        <div className="flex flex-col gap-4 px-5 py-6 lg:mx-auto lg:max-w-3xl lg:px-8">
          <SettingsSection title="Visibilité">
            <SettingsRow
              label="Visibilité du profil"
              helper="Apparaître dans Découvrir et Explorer"
            >
              <Toggle
                label="Visibilité du profil"
                checked={profile.visibilityPublic}
                onChange={(v) => patchProfile({ visibilityPublic: v })}
              />
            </SettingsRow>
            <SettingsRow label="Afficher mon statut en ligne">
              <Toggle
                label="Afficher mon statut en ligne"
                checked={profile.onlineStatusVisible}
                onChange={(v) => patchProfile({ onlineStatusVisible: v })}
              />
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="À propos de toi">
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">
                Ta vision du mariage
              </span>
              <textarea
                value={profile.bio ?? ''}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                onBlur={(e) => patchProfile({ bio: e.target.value.trim() || null })}
                maxLength={500}
                rows={3}
                placeholder="Décris en quelques mots ce que tu recherches…"
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              />
              <SuggestionChips
                suggestions={BIO_SUGGESTIONS}
                onSelect={(text) => {
                  setProfile({ ...profile, bio: text });
                  void patchProfile({ bio: text });
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Mes qualités</span>
              <textarea
                value={profile.qualities ?? ''}
                onChange={(e) => setProfile({ ...profile, qualities: e.target.value })}
                onBlur={(e) => patchProfile({ qualities: e.target.value.trim() || null })}
                maxLength={300}
                rows={2}
                placeholder="Ex : Déterminé(e), patient(e), à l'écoute…"
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              />
              <SuggestionChips
                suggestions={QUALITIES_SUGGESTIONS}
                onSelect={(text) => {
                  setProfile({ ...profile, qualities: text });
                  void patchProfile({ qualities: text });
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Mes défauts</span>
              <textarea
                value={profile.flaws ?? ''}
                onChange={(e) => setProfile({ ...profile, flaws: e.target.value })}
                onBlur={(e) => patchProfile({ flaws: e.target.value.trim() || null })}
                maxLength={300}
                rows={2}
                placeholder="Ex : Un peu impatient(e), perfectionniste…"
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              />
              <SuggestionChips
                suggestions={FLAWS_SUGGESTIONS}
                onSelect={(text) => {
                  setProfile({ ...profile, flaws: text });
                  void patchProfile({ flaws: text });
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">
                Ce que je n&rsquo;accepte pas
              </span>
              <textarea
                value={profile.dealbreakers ?? ''}
                onChange={(e) => setProfile({ ...profile, dealbreakers: e.target.value })}
                onBlur={(e) => patchProfile({ dealbreakers: e.target.value.trim() || null })}
                maxLength={300}
                rows={2}
                placeholder="Ex : Le manque de sincérité, la violence…"
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              />
              <SuggestionChips
                suggestions={DEALBREAKERS_SUGGESTIONS}
                onSelect={(text) => {
                  setProfile({ ...profile, dealbreakers: text });
                  void patchProfile({ dealbreakers: text });
                }}
              />
            </label>
          </SettingsSection>

          <SettingsSection title="Situation familiale">
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Religion</span>
              <select
                value={profile.religion ?? ''}
                onChange={(e) => patchProfile({ religion: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Non précisé</option>
                {Object.entries(RELIGION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Statut marital</span>
              <select
                value={profile.maritalStatus ?? ''}
                onChange={(e) => patchProfile({ maritalStatus: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Non précisé</option>
                {Object.entries(MARITAL_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">Enfants</span>
              <select
                value={profile.childrenCount ?? ''}
                onChange={(e) => patchProfile({ childrenCount: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Non précisé</option>
                {CHILDREN_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">
                Souhaite (encore) des enfants
              </span>
              <select
                value={profile.wantsChildren ?? ''}
                onChange={(e) => patchProfile({ wantsChildren: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Non précisé</option>
                {WANTS_CHILDREN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-sm font-medium text-foreground">
                Ouvert(e) à déménager
              </span>
              <select
                value={profile.relocateOpen ?? ''}
                onChange={(e) => patchProfile({ relocateOpen: e.target.value || null })}
                className="rounded-lg border border-border bg-background px-3 py-2.5 font-body text-sm text-foreground"
              >
                <option value="">Non précisé</option>
                {RELOCATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
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
