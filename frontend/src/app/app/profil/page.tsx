// Mon profil — read-only self-preview (GET /api/profile), i.e. "how do I
// look to others". Editing already lives in Paramètres (visibility/online
// status/commune/intent via PATCH /api/profile) — this screen doesn't
// duplicate that form, it links to it instead. The one exception is photo
// management (2026-08-10, user-driven — "ajouter les images" was a real
// gap: no post-onboarding photo flow existed anywhere in this kit): the
// camera button uploads via POST /api/upload then appends via POST
// /api/profile/photos, and the thumbnail strip below the hero carousel
// deletes via DELETE /api/profile/photos/[id] — kept on this screen rather
// than Paramètres since it's the "how I look" preview, not a form field.
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { PhotoCarousel } from '@/components/yeoyo/PhotoCarousel';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { INTENT_LABELS } from '@/lib/yeoyo/types';
import { COOKIE_PREFIX } from '@/lib/constants';

// api.ts doesn't export a CSRF-token getter (protected file), and the
// multipart /api/upload call can't go through api()'s JSON-only body — same
// workaround the onboarding wizard uses for its own photo upload.
function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const key = `${COOKIE_PREFIX}-csrf`;
  const fromStorage = localStorage.getItem(key);
  if (fromStorage) return fromStorage;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

interface ProfileSelf {
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  photoUrls: string[];
  photos: { id: string; url: string | null; isPrimary: boolean }[];
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function onPhotoSelected(file: File) {
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const csrfToken = readCsrfToken();
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
      });
      if (!uploadRes.ok) {
        const body = (await uploadRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "L'envoi de la photo a échoué");
      }
      const uploaded = (await uploadRes.json()) as { id: string };

      await api('/api/profile/photos', { method: 'POST', body: { uploadId: uploaded.id } });
      await load();
      toast('Photo ajoutée', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function onDeletePhoto(photoId: string) {
    try {
      await api(`/api/profile/photos/${photoId}`, { method: 'DELETE' });
      await load();
      toast('Photo supprimée', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

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
                <PhotoCarousel
                  photoUrls={profile.photoUrls}
                  name={profile.firstName}
                  heightPx={240}
                />
                {profile.verifiedAt && (
                  <div
                    className={`absolute left-3 flex items-center gap-1.5 rounded-lg bg-background/90 px-2.5 py-1 ${profile.photoUrls.length > 1 ? 'top-6' : 'top-3'}`}
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-verified" />
                    <span className="font-body text-xs font-medium text-foreground">
                      Vérifié IA
                    </span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onPhotoSelected(file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto || profile.photos.length >= 6}
                  className="absolute bottom-3 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-90 disabled:opacity-50"
                  aria-label={
                    profile.photos.length > 0 ? 'Ajouter une photo' : 'Ajouter ma première photo'
                  }
                >
                  <Icon name="camera" size={17} />
                </button>
              </div>

              {profile.photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto px-4 pt-4">
                  {profile.photos.map((p) => (
                    <div key={p.id} className="relative flex-shrink-0">
                      <div className="h-16 w-16 overflow-hidden rounded-lg border border-border bg-muted">
                        {p.url && (
                          // Small fixed 64x64 thumbnail — not worth next/image's overhead here.
                          <img src={p.url} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      {p.isPrimary && (
                        <span className="absolute bottom-0.5 left-0.5 rounded bg-primary px-1 py-0.5 font-body text-[9px] font-semibold text-primary-foreground">
                          Principale
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void onDeletePhoto(p.id)}
                        aria-label="Supprimer cette photo"
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted-foreground shadow"
                      >
                        <Icon name="x" size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
