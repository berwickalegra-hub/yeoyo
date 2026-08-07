// Mon profil — read-only self-preview (GET /api/profile), i.e. "how do I
// look to others". Editing already lives in Paramètres (visibility/online
// status/commune/intent via PATCH /api/profile) — this screen doesn't
// duplicate that form, it links to it instead.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { ProfilePhotoCover } from '@/components/yeoyo/ProfilePhotoCover';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { INTENT_LABELS } from '@/lib/yeoyo/types';

interface ProfileSelf {
  firstName: string;
  lastName: string | null;
  dateOfBirth: string;
  city: string;
  commune: string | null;
  religion: string | null;
  maritalStatus: string | null;
  childrenCount: string | null;
  intent: string;
  job: string | null;
  bio: string | null;
  interests: string[];
  languages: string[];
  verifiedAt: string | null;
  verificationStatus: string;
}

const RELIGION_LABELS: Record<string, string> = {
  CHRETIEN: 'Chrétien(ne)',
  CATHOLIQUE: 'Catholique',
  PROTESTANT: 'Protestant(e)',
  MUSULMAN: 'Musulman(e)',
};

const MARITAL_LABELS: Record<string, string> = {
  CELIBATAIRE: 'Célibataire',
  DIVORCE: 'Divorcé(e)',
  VEUF_VEUVE: 'Veuf/Veuve',
};

const CHILDREN_LABELS: Record<string, string> = {
  '0': 'Sans enfant',
  '1': '1 enfant',
  '2': '2 enfants',
  '3+': '3 enfants ou plus',
};

function ageInYears(dobIso: string): number {
  const dob = new Date(dobIso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export default function ProfilPage() {
  const user = useUser();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const [profile, setProfile] = useState<ProfileSelf | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ profile: ProfileSelf }>('/api/profile');
      setProfile(res.profile);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!user) return null;

  return (
    <AppShell active="profil" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <div className="border-b border-border px-5 py-5 lg:px-8">
        <h1 className="font-headings text-xl font-bold text-foreground">Mon profil</h1>
        <p className="mt-0.5 font-body text-sm text-muted-foreground">
          Aperçu de ton profil tel qu’il apparaît aux autres membres
        </p>
      </div>

      <div className="flex flex-col gap-4 px-5 py-6 lg:mx-auto lg:w-full lg:max-w-xl lg:px-8">
        {loading && <p className="font-body text-sm text-muted-foreground">Chargement…</p>}

        {profile && (
          <>
            <VerificationBanner status={profile.verificationStatus} />

            <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
              <div className="relative">
                <ProfilePhotoCover photoUrl={null} name={profile.firstName} heightPx={240} />
                {profile.verifiedAt && (
                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg bg-background/90 px-2.5 py-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-verified" />
                    <span className="font-body text-xs font-medium text-foreground">
                      Vérifié IA
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-headings text-lg font-bold text-foreground">
                      {profile.firstName}
                      {profile.lastName ? ` ${profile.lastName}` : ''}
                    </span>
                    <span className="ml-2 font-body text-sm text-muted-foreground">
                      {ageInYears(profile.dateOfBirth)} ans
                    </span>
                  </div>
                  {(profile.commune ?? profile.city) && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Icon name="map-pin" size={13} />
                      <span className="font-body text-xs">{profile.commune ?? profile.city}</span>
                    </div>
                  )}
                </div>

                {profile.job && (
                  <p className="font-body text-sm text-muted-foreground">{profile.job}</p>
                )}

                <div className="flex items-center gap-1.5">
                  <Icon name="gem" size={12} />
                  <span className="font-body text-xs font-medium text-primary">
                    {INTENT_LABELS[profile.intent] ?? profile.intent}
                  </span>
                </div>

                {profile.bio && <p className="font-body text-sm text-foreground">{profile.bio}</p>}

                <div className="flex flex-wrap gap-1.5">
                  {profile.religion && (
                    <Tag>{RELIGION_LABELS[profile.religion] ?? profile.religion}</Tag>
                  )}
                  {profile.maritalStatus && (
                    <Tag>{MARITAL_LABELS[profile.maritalStatus] ?? profile.maritalStatus}</Tag>
                  )}
                  {profile.childrenCount && (
                    <Tag>{CHILDREN_LABELS[profile.childrenCount] ?? profile.childrenCount}</Tag>
                  )}
                </div>

                {profile.interests.length > 0 && (
                  <div>
                    <p className="font-body text-xs font-medium text-muted-foreground">
                      Centres d’intérêt
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {profile.interests.map((i) => (
                        <Tag key={i}>{i}</Tag>
                      ))}
                    </div>
                  </div>
                )}

                {profile.languages.length > 0 && (
                  <div>
                    <p className="font-body text-xs font-medium text-muted-foreground">Langues</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {profile.languages.map((l) => (
                        <Tag key={l}>{l}</Tag>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Link
              href="/app/parametres"
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface font-body text-sm font-medium text-foreground"
            >
              <Icon name="settings" size={16} />
              Modifier mes informations
            </Link>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-md bg-muted px-2.5 py-1 font-body text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function VerificationBanner({ status }: { status: string }) {
  if (status === 'VERIFIED') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-verified/30 bg-verified/10 px-4 py-3">
        <Icon name="shield-check" size={16} className="text-verified" />
        <span className="font-body text-sm text-foreground">
          Ton profil est vérifié — il apparaît avec le badge « Vérifié IA ».
        </span>
      </div>
    );
  }
  if (status === 'REJECTED') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
        <Icon name="info" size={16} className="text-red-500" />
        <span className="font-body text-sm text-foreground">
          Ta demande de vérification a été refusée. Contacte le support pour en savoir plus.
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
      <Icon name="clock" size={16} className="text-muted-foreground" />
      <span className="font-body text-sm text-muted-foreground">
        Profil en attente de vérification par notre équipe.
      </span>
    </div>
  );
}
