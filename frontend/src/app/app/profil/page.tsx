// Mon profil — rebuilt 2026-08-13 to match Banani's `ProfilePage.jsx`
// ("YeOyo — Mon Profil", flow `l_YkRVFXx5e9`) in full detail, per explicit
// user ask ("écrase ce qu'on a et remplace par ce qui est sur Banani...
// tenir compte que cela soit bien détaillé"). Real backend functionality
// from the previous version is preserved, not removed — photo upload/
// delete (POST /api/upload → POST /api/profile/photos, DELETE .../[id]),
// the verification-status banner — just reshaped into Banani's richer
// two-column layout (completion banner / identity block / photo gallery /
// content sections / right sidebar) instead of the old single-card preview.
//
// Field-by-field honesty notes (no fabricated data — see CLAUDE.md /
// STATUS.md precedent):
//   - Banani's "Informations personnelles" grid shows 6 rows (Âge/Ville/
//     Statut/Profession/Études/Situation) — this kit collects the first 4
//     for real plus `wantsChildren`/`relocateOpen` (richer real fields
//     Banani's own mock doesn't have); "Études"/"Situation" aren't
//     collected anywhere in this kit and are omitted rather than faked.
//   - "Ma vision du mariage" reuses the real `bio` field (onboarding's own
//     step 3 literally labels it "Ta vision du mariage") — Banani's
//     separate generic "Parle-nous de toi" card would just duplicate the
//     same text under a second heading, so it isn't shown twice.
//   - "Ce que je recherche" shows real `intent` + `dealbreakers` ("Ce que
//     je n'accepte pas" is this kit's own field for that concept) —
//     Banani's age-range/education-level-sought fields aren't collected,
//     omitted rather than faked.
//   - Right-sidebar "Vérification" shows this kit's one real aggregate
//     `verificationStatus`, not Banani's 3 separately-tracked rows (ID
//     card/selfie/phone) — that granularity doesn't exist in the data
//     model.
//   - Stats card is real: GET /api/profile/stats (visitors/favorited-by/
//     contact-requests-received, all real counts, new 2026-08-13).
//
// Editing: every field on this page — bio/qualités/défauts/dealbreakers
// (text) and commune/religion/statut marital/enfants/relocation/visibilité/
// intent/interestedIn (structured) — is inline-editable right here (PATCH
// /api/profile). This used to be split across /app/parametres/profil and
// /app/parametres/preferences, which caused a real bug (2026-08-14, second
// pass, explicit user report with screenshots): the completion banner sent
// the user to one page while a still-missing field (bio) lived on this one,
// so a user who'd filled in everything on the destination page still saw
// "profile incomplete" with no visible missing field to fix. Both settings
// sub-pages were deleted; every completeness-tracked field now lives on
// this single page, so "go complete your profile" can only ever mean "come
// here."
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon, type IconName } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Toggle } from '@/components/ui/Toggle';
import { AppShell } from '@/components/yeoyo/AppShell';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import {
  INTENT_LABELS,
  RELIGION_LABELS,
  MARITAL_STATUS_LABELS,
  WANTS_CHILDREN_LABELS,
} from '@/lib/yeoyo/types';
import { KINSHASA_COMMUNES, INTENT_OPTIONS } from '@/lib/yeoyo/constants';
import { COOKIE_PREFIX } from '@/lib/constants';

// Option lists moved here from the now-deleted /app/parametres/profil and
// /app/parametres/preferences (2026-08-14, second pass) — see the
// "Informations personnelles" / "Ce que je recherche" edit forms below.
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

const INTERESTED_IN_OPTIONS = [
  { value: 'FEMME', label: 'Femmes' },
  { value: 'HOMME', label: 'Hommes' },
  { value: 'TOUS', label: 'Les deux' },
];

function readCsrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const key = `${COOKIE_PREFIX}-csrf`;
  const fromStorage = localStorage.getItem(key);
  if (fromStorage) return fromStorage;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

// Mirrors onboarding/page.tsx's uploadPhotoWithAuthRetry: this raw multipart
// fetch bypasses api.ts's auto-refresh (JSON-only bodies), so a stale
// access-token JWT used to surface as a bare 401 with no `message` field,
// mislabelled as a generic upload failure below.
async function uploadPhotoWithAuthRetry(file: File): Promise<string> {
  async function attempt(): Promise<Response> {
    const form = new FormData();
    form.append('file', file);
    const csrfToken = readCsrfToken();
    return fetch('/api/upload', {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    });
  }

  let res = await attempt();
  if (res.status === 401) {
    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => null);
    if (refreshRes?.ok) {
      const refreshBody = (await refreshRes.json().catch(() => ({}))) as {
        csrfToken?: string;
      };
      if (refreshBody.csrfToken) storeCsrfToken(refreshBody.csrfToken);
      res = await attempt();
    } else {
      throw new Error('Ta session a expiré. Reconnecte-toi puis réessaie.');
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "L'envoi de la photo a échoué. Réessaie.");
  }
  const uploaded = (await res.json()) as { id: string };
  return uploaded.id;
}

interface ProfileSelf {
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  photos: { id: string; url: string | null; isPrimary: boolean }[];
  dateOfBirth: string;
  city: string;
  commune: string | null;
  religion: string | null;
  maritalStatus: string | null;
  childrenCount: string | null;
  wantsChildren: string | null;
  relocateOpen: string | null;
  interestedIn: string | null;
  visibilityPublic: boolean;
  onlineStatusVisible: boolean;
  intent: string;
  job: string | null;
  bio: string | null;
  qualities: string | null;
  flaws: string | null;
  dealbreakers: string | null;
  interests: string[];
  verifiedAt: string | null;
  verificationStatus: string;
}

interface ProfileStats {
  visitorsCount: number;
  favoritedByCount: number;
  requestsReceivedCount: number;
}

function ageInYears(dobIso: string): number {
  const dob = new Date(dobIso);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent">
        <Icon name={icon} size={14} className="text-primary" />
      </div>
      <div>
        <p className="font-body text-xs text-muted-foreground">{label}</p>
        <p className="font-body text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default function ProfilPage() {
  const user = useUser();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();

  const [profile, setProfile] = useState<ProfileSelf | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [savingBio, setSavingBio] = useState(false);

  const [editingQualities, setEditingQualities] = useState(false);
  const [qualitiesDraft, setQualitiesDraft] = useState('');
  const [savingQualities, setSavingQualities] = useState(false);

  const [editingFlaws, setEditingFlaws] = useState(false);
  const [flawsDraft, setFlawsDraft] = useState('');
  const [savingFlaws, setSavingFlaws] = useState(false);

  const [editingInterests, setEditingInterests] = useState(false);
  const [interestsDraft, setInterestsDraft] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState('');
  const [savingInterests, setSavingInterests] = useState(false);

  const [editingInfo, setEditingInfo] = useState(false);
  const [infoDraft, setInfoDraft] = useState({
    commune: '',
    religion: '',
    maritalStatus: '',
    childrenCount: '',
    wantsChildren: '',
    relocateOpen: '',
  });
  const [savingInfo, setSavingInfo] = useState(false);

  const [editingSearch, setEditingSearch] = useState(false);
  const [searchDraft, setSearchDraft] = useState({
    intent: '',
    interestedIn: '',
    dealbreakers: '',
  });
  const [savingSearch, setSavingSearch] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, statsRes] = await Promise.all([
        api<{ profile: ProfileSelf }>('/api/profile'),
        api<ProfileStats>('/api/profile/stats'),
      ]);
      setProfile(profileRes.profile);
      setStats(statsRes);
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
      const uploadId = await uploadPhotoWithAuthRetry(file);
      await api('/api/profile/photos', { method: 'POST', body: { uploadId } });
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

  async function saveBio() {
    setSavingBio(true);
    try {
      await api('/api/profile', { method: 'PATCH', body: { bio: bioDraft.trim() || null } });
      setProfile((p) => (p ? { ...p, bio: bioDraft.trim() || null } : p));
      setEditingBio(false);
      toast('Vision du mariage mise à jour', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSavingBio(false);
    }
  }

  async function saveQualities() {
    setSavingQualities(true);
    try {
      await api('/api/profile', {
        method: 'PATCH',
        body: { qualities: qualitiesDraft.trim() || null },
      });
      setProfile((p) => (p ? { ...p, qualities: qualitiesDraft.trim() || null } : p));
      setEditingQualities(false);
      toast('Qualités mises à jour', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSavingQualities(false);
    }
  }

  async function saveFlaws() {
    setSavingFlaws(true);
    try {
      await api('/api/profile', { method: 'PATCH', body: { flaws: flawsDraft.trim() || null } });
      setProfile((p) => (p ? { ...p, flaws: flawsDraft.trim() || null } : p));
      setEditingFlaws(false);
      toast('Défauts mis à jour', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSavingFlaws(false);
    }
  }

  function addInterestFromInput() {
    const value = interestInput.trim();
    if (!value) return;
    if (interestsDraft.length >= 15) return;
    if (!interestsDraft.some((i) => i.toLowerCase() === value.toLowerCase())) {
      setInterestsDraft((prev) => [...prev, value]);
    }
    setInterestInput('');
  }

  function removeInterest(value: string) {
    setInterestsDraft((prev) => prev.filter((i) => i !== value));
  }

  async function saveInterests() {
    setSavingInterests(true);
    try {
      await api('/api/profile', { method: 'PATCH', body: { interests: interestsDraft } });
      setProfile((p) => (p ? { ...p, interests: interestsDraft } : p));
      setEditingInterests(false);
      toast('Centres d’intérêt mis à jour', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSavingInterests(false);
    }
  }

  async function saveInfo() {
    setSavingInfo(true);
    try {
      const body = {
        commune: infoDraft.commune || null,
        religion: infoDraft.religion || null,
        maritalStatus: infoDraft.maritalStatus || null,
        childrenCount: infoDraft.childrenCount || null,
        wantsChildren: infoDraft.wantsChildren || null,
        relocateOpen: infoDraft.relocateOpen || null,
      };
      await api('/api/profile', { method: 'PATCH', body });
      setProfile((p) => (p ? { ...p, ...body } : p));
      setEditingInfo(false);
      toast('Informations mises à jour', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSavingInfo(false);
    }
  }

  async function saveSearch() {
    setSavingSearch(true);
    try {
      const body = {
        intent: searchDraft.intent,
        interestedIn: searchDraft.interestedIn || null,
        dealbreakers: searchDraft.dealbreakers.trim() || null,
      };
      await api('/api/profile', { method: 'PATCH', body });
      setProfile((p) => (p ? { ...p, ...body } : p));
      setEditingSearch(false);
      toast('Critères mis à jour', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setSavingSearch(false);
    }
  }

  async function toggleVisibility(
    field: 'visibilityPublic' | 'onlineStatusVisible',
    value: boolean,
  ) {
    if (!profile) return;
    const previous = profile[field];
    setProfile((p) => (p ? { ...p, [field]: value } : p));
    try {
      await api('/api/profile', { method: 'PATCH', body: { [field]: value } });
    } catch (err) {
      setProfile((p) => (p ? { ...p, [field]: previous } : p));
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  if (!user) return null;

  return (
    <AppShell
      active="profil"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <div className="px-5 py-5 lg:px-8 lg:py-6">
        {loading && <p className="font-body text-sm text-muted-foreground">Chargement…</p>}

        {profile && (
          <div className="mx-auto flex max-w-5xl flex-col gap-5">
            {/* No completion banner here (removed 2026-08-14, second pass) —
                it used to send the user away to a second page to fill in
                fields that live right here on this same page, which is
                exactly the split-across-two-pages confusion that caused the
                reported bug (fields shown "complete" on the destination page
                while the banner kept reappearing, because the last missing
                field — bio — was actually below this banner, on this page).
                The one remaining completion nudge lives on Découvrir only,
                dismissible, since a banner sitting on top of the very
                fields it's pointing at is redundant, not helpful. */}

            {/* Identity block */}
            <div className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-6 sm:flex-row sm:items-start">
              <div className="relative flex-shrink-0 self-center sm:self-start">
                <div className="avatar-ring h-28 w-28 overflow-hidden rounded-xl border-2 border-transparent bg-muted">
                  <UserAvatar
                    name={profile.firstName}
                    avatarUrl={profile.photoUrl}
                    size={112}
                    className="rounded-xl"
                  />
                </div>
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
                  className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg disabled:opacity-50"
                  aria-label="Changer la photo principale"
                >
                  <Icon name="camera" size={14} />
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-3 text-center sm:text-left">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center justify-center gap-2 sm:justify-start">
                      <h1 className="font-headings text-2xl font-bold text-foreground lg:text-3xl">
                        {profile.firstName}
                        {profile.lastName ? ` ${profile.lastName}` : ''}
                      </h1>
                      <span className="font-body text-lg text-muted-foreground lg:text-xl">
                        {ageInYears(profile.dateOfBirth)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-center gap-1 font-body text-sm text-muted-foreground sm:justify-start">
                      <Icon name="map-pin" size={13} />
                      {[profile.commune, profile.city].filter(Boolean).join(', ')}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                      {profile.verificationStatus === 'VERIFIED' && (
                        <span className="flex items-center gap-1 rounded-xl bg-verified px-2.5 py-1 font-body text-xs font-bold text-verified-foreground">
                          <Icon name="shield-check" size={11} />
                          Profil vérifié
                        </span>
                      )}
                      <span className="flex items-center gap-1 rounded-xl border border-border px-2.5 py-1 font-body text-xs text-muted-foreground">
                        <Icon name="gem" size={11} />
                        {INTENT_LABELS[profile.intent] ?? profile.intent}
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/app/profils/${user.id}`}
                    className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-primary px-4 py-2 font-body text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    <Icon name="eye" size={14} />
                    Voir mon profil public
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* Left column */}
              <div className="flex flex-col gap-5 lg:col-span-2">
                {/* Photo gallery */}
                <div className="rounded-xl border border-border bg-surface p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="font-headings text-base font-bold text-foreground">Mes photos</p>
                    <span className="font-body text-xs text-muted-foreground">
                      {profile.photos.length} / 6 photos
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {profile.photos.map((p) => (
                      <div
                        key={p.id}
                        className="relative aspect-square overflow-hidden rounded-lg border-2 border-border"
                      >
                        {p.url && (
                          // Small fixed thumbnail grid — not worth next/image's overhead here.
                          <img src={p.url} alt="" className="h-full w-full object-cover" />
                        )}
                        {p.isPrimary && (
                          <div className="absolute bottom-0 left-0 right-0 bg-primary py-0.5 text-center font-body text-xs font-bold text-primary-foreground">
                            Principale
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => void onDeletePhoto(p.id)}
                          aria-label="Supprimer cette photo"
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/50"
                        >
                          <Icon name="x" size={9} className="text-background" />
                        </button>
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 6 - profile.photos.length) }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingPhoto}
                        className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground disabled:opacity-50"
                      >
                        <Icon name="plus" size={18} />
                        <span className="font-body text-xs">Ajouter</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Vision du mariage — real bio field, inline editable */}
                <div className="rounded-xl border border-border bg-surface p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="font-headings text-base font-bold text-foreground">
                      Ma vision du mariage
                    </p>
                    {!editingBio && (
                      <button
                        type="button"
                        onClick={() => {
                          setBioDraft(profile.bio ?? '');
                          setEditingBio(true);
                        }}
                        className="flex items-center gap-1 rounded-lg border border-primary px-2.5 py-1 font-body text-xs text-primary"
                      >
                        <Icon name="pencil" size={11} />
                        Modifier
                      </button>
                    )}
                  </div>
                  {editingBio ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={bioDraft}
                        onChange={(e) => setBioDraft(e.target.value)}
                        maxLength={500}
                        rows={4}
                        className="w-full rounded-lg border border-border bg-background p-3 font-body text-sm text-foreground"
                        placeholder="Pour moi, le mariage c'est..."
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingBio(false)}
                          className="rounded-lg px-3 py-1.5 font-body text-xs text-muted-foreground"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveBio()}
                          disabled={savingBio}
                          className="rounded-lg bg-primary px-4 py-1.5 font-body text-xs font-bold text-primary-foreground disabled:opacity-50"
                        >
                          {savingBio ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="font-body text-sm leading-relaxed text-foreground">
                      {profile.bio ?? (
                        <span className="text-muted-foreground">
                          Pas encore renseigné — clique sur Modifier pour ajouter la tienne.
                        </span>
                      )}
                    </p>
                  )}
                </div>

                {/* Qualités / Défauts — real fields, inline editable. Moved
                    here from Paramètres → Profil (2026-08-14) so that page's
                    duplicate "À propos de toi" form could be removed —
                    editing the same free-text fields from two different
                    pages was redundant, not two real features. */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-surface p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <p className="font-headings text-base font-bold text-foreground">
                        Mes qualités
                      </p>
                      {!editingQualities && (
                        <button
                          type="button"
                          onClick={() => {
                            setQualitiesDraft(profile.qualities ?? '');
                            setEditingQualities(true);
                          }}
                          className="flex items-center gap-1 rounded-lg border border-primary px-2.5 py-1 font-body text-xs text-primary"
                        >
                          <Icon name="pencil" size={11} />
                          Modifier
                        </button>
                      )}
                    </div>
                    {editingQualities ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={qualitiesDraft}
                          onChange={(e) => setQualitiesDraft(e.target.value)}
                          maxLength={300}
                          rows={2}
                          className="w-full rounded-lg border border-border bg-background p-3 font-body text-sm text-foreground"
                          placeholder="Ex : Déterminé(e), patient(e), à l'écoute…"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingQualities(false)}
                            className="rounded-lg px-3 py-1.5 font-body text-xs text-muted-foreground"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveQualities()}
                            disabled={savingQualities}
                            className="rounded-lg bg-primary px-4 py-1.5 font-body text-xs font-bold text-primary-foreground disabled:opacity-50"
                          >
                            {savingQualities ? 'Enregistrement…' : 'Enregistrer'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="font-body text-sm leading-relaxed text-foreground">
                        {profile.qualities ?? (
                          <span className="text-muted-foreground">Pas encore renseigné.</span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border bg-surface p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <p className="font-headings text-base font-bold text-foreground">
                        Mes défauts
                      </p>
                      {!editingFlaws && (
                        <button
                          type="button"
                          onClick={() => {
                            setFlawsDraft(profile.flaws ?? '');
                            setEditingFlaws(true);
                          }}
                          className="flex items-center gap-1 rounded-lg border border-primary px-2.5 py-1 font-body text-xs text-primary"
                        >
                          <Icon name="pencil" size={11} />
                          Modifier
                        </button>
                      )}
                    </div>
                    {editingFlaws ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={flawsDraft}
                          onChange={(e) => setFlawsDraft(e.target.value)}
                          maxLength={300}
                          rows={2}
                          className="w-full rounded-lg border border-border bg-background p-3 font-body text-sm text-foreground"
                          placeholder="Ex : Un peu impatient(e), perfectionniste…"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingFlaws(false)}
                            className="rounded-lg px-3 py-1.5 font-body text-xs text-muted-foreground"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveFlaws()}
                            disabled={savingFlaws}
                            className="rounded-lg bg-primary px-4 py-1.5 font-body text-xs font-bold text-primary-foreground disabled:opacity-50"
                          >
                            {savingFlaws ? 'Enregistrement…' : 'Enregistrer'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="font-body text-sm leading-relaxed text-foreground">
                        {profile.flaws ?? (
                          <span className="text-muted-foreground">Pas encore renseigné.</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {/* Centres d'intérêt — chip editor (type + Entrée/virgule
                    pour ajouter, × pour retirer). Distinct from
                    qualités/défauts (free text) since it's an array field
                    on Profile; shown on the discovery card
                    (ProfileInfoSections) so a match can judge compatibility
                    before sending a request. */}
                <div className="rounded-xl border border-border bg-surface p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="font-headings text-base font-bold text-foreground">
                      Mes centres d&apos;intérêt
                    </p>
                    {!editingInterests && (
                      <button
                        type="button"
                        onClick={() => {
                          setInterestsDraft(profile.interests);
                          setInterestInput('');
                          setEditingInterests(true);
                        }}
                        className="flex items-center gap-1 rounded-lg border border-primary px-2.5 py-1 font-body text-xs text-primary"
                      >
                        <Icon name="pencil" size={11} />
                        Modifier
                      </button>
                    )}
                  </div>
                  {editingInterests ? (
                    <div className="flex flex-col gap-3">
                      {interestsDraft.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {interestsDraft.map((interest) => (
                            <span
                              key={interest}
                              className="flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 font-body text-xs text-foreground"
                            >
                              {interest}
                              <button
                                type="button"
                                onClick={() => removeInterest(interest)}
                                aria-label={`Retirer ${interest}`}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Icon name="x" size={11} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <input
                        type="text"
                        value={interestInput}
                        onChange={(e) => setInterestInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            addInterestFromInput();
                          }
                        }}
                        maxLength={30}
                        disabled={interestsDraft.length >= 15}
                        placeholder={
                          interestsDraft.length >= 15
                            ? 'Maximum 15 atteint'
                            : 'Ex : Cuisine, voyages, lecture… (Entrée pour ajouter)'
                        }
                        className="w-full rounded-lg border border-border bg-background p-3 font-body text-sm text-foreground disabled:opacity-50"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingInterests(false)}
                          className="rounded-lg px-3 py-1.5 font-body text-xs text-muted-foreground"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveInterests()}
                          disabled={savingInterests}
                          className="rounded-lg bg-primary px-4 py-1.5 font-body text-xs font-bold text-primary-foreground disabled:opacity-50"
                        >
                          {savingInterests ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                      </div>
                    </div>
                  ) : profile.interests.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {profile.interests.map((interest) => (
                        <span
                          key={interest}
                          className="rounded-lg bg-accent px-2.5 py-1 font-body text-xs text-foreground"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="font-body text-sm text-muted-foreground">Pas encore renseigné.</p>
                  )}
                </div>

                {/* Visibilité — direct toggles, no draft/edit-mode needed
                    (a switch applies immediately, unlike a text field).
                    Moved here from the now-deleted /app/parametres/profil. */}
                <div className="rounded-xl border border-border bg-surface p-5">
                  <p className="mb-4 font-headings text-base font-bold text-foreground">
                    Visibilité
                  </p>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-body text-sm font-medium text-foreground">
                          Visibilité du profil
                        </p>
                        <p className="font-body text-xs text-muted-foreground">
                          Apparaître dans Découvrir et Explorer
                        </p>
                      </div>
                      <Toggle
                        label="Visibilité du profil"
                        checked={profile.visibilityPublic}
                        onChange={(v) => void toggleVisibility('visibilityPublic', v)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-body text-sm font-medium text-foreground">
                        Afficher mon statut en ligne
                      </p>
                      <Toggle
                        label="Afficher mon statut en ligne"
                        checked={profile.onlineStatusVisible}
                        onChange={(v) => void toggleVisibility('onlineStatusVisible', v)}
                      />
                    </div>
                  </div>
                </div>

                {/* Informations personnelles — real fields, inline editable
                    (moved here from /app/parametres/profil, 2026-08-14
                    second pass — see file-header comment for why). */}
                <div className="rounded-xl border border-border bg-surface p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="font-headings text-base font-bold text-foreground">
                      Informations personnelles
                    </p>
                    {!editingInfo && (
                      <button
                        type="button"
                        onClick={() => {
                          setInfoDraft({
                            commune: profile.commune ?? '',
                            religion: profile.religion ?? '',
                            maritalStatus: profile.maritalStatus ?? '',
                            childrenCount: profile.childrenCount ?? '',
                            wantsChildren: profile.wantsChildren ?? '',
                            relocateOpen: profile.relocateOpen ?? '',
                          });
                          setEditingInfo(true);
                        }}
                        className="flex items-center gap-1 rounded-lg border border-primary px-2.5 py-1 font-body text-xs text-primary"
                      >
                        <Icon name="pencil" size={11} />
                        Modifier
                      </button>
                    )}
                  </div>

                  {editingInfo ? (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="font-body text-xs text-muted-foreground">Commune</span>
                          <select
                            value={infoDraft.commune}
                            onChange={(e) =>
                              setInfoDraft((d) => ({ ...d, commune: e.target.value }))
                            }
                            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
                          >
                            <option value="">Non précisé</option>
                            {KINSHASA_COMMUNES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="font-body text-xs text-muted-foreground">Religion</span>
                          <select
                            value={infoDraft.religion}
                            onChange={(e) =>
                              setInfoDraft((d) => ({ ...d, religion: e.target.value }))
                            }
                            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
                          >
                            <option value="">Non précisé</option>
                            {Object.entries(RELIGION_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="font-body text-xs text-muted-foreground">
                            Statut marital
                          </span>
                          <select
                            value={infoDraft.maritalStatus}
                            onChange={(e) =>
                              setInfoDraft((d) => ({ ...d, maritalStatus: e.target.value }))
                            }
                            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
                          >
                            <option value="">Non précisé</option>
                            {Object.entries(MARITAL_STATUS_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="font-body text-xs text-muted-foreground">Enfants</span>
                          <select
                            value={infoDraft.childrenCount}
                            onChange={(e) =>
                              setInfoDraft((d) => ({ ...d, childrenCount: e.target.value }))
                            }
                            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
                          >
                            <option value="">Non précisé</option>
                            {CHILDREN_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="font-body text-xs text-muted-foreground">
                            Souhaite (encore) des enfants
                          </span>
                          <select
                            value={infoDraft.wantsChildren}
                            onChange={(e) =>
                              setInfoDraft((d) => ({ ...d, wantsChildren: e.target.value }))
                            }
                            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
                          >
                            <option value="">Non précisé</option>
                            {WANTS_CHILDREN_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="font-body text-xs text-muted-foreground">
                            Ouvert(e) à déménager
                          </span>
                          <select
                            value={infoDraft.relocateOpen}
                            onChange={(e) =>
                              setInfoDraft((d) => ({ ...d, relocateOpen: e.target.value }))
                            }
                            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
                          >
                            <option value="">Non précisé</option>
                            {RELOCATE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingInfo(false)}
                          className="rounded-lg px-3 py-1.5 font-body text-xs text-muted-foreground"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveInfo()}
                          disabled={savingInfo}
                          className="rounded-lg bg-primary px-4 py-1.5 font-body text-xs font-bold text-primary-foreground disabled:opacity-50"
                        >
                          {savingInfo ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <InfoRow
                        icon="calendar"
                        label="Âge"
                        value={`${ageInYears(profile.dateOfBirth)} ans`}
                      />
                      <InfoRow
                        icon="map-pin"
                        label="Ville"
                        value={profile.commune ?? profile.city}
                      />
                      <InfoRow
                        icon="heart"
                        label="Statut"
                        value={
                          profile.maritalStatus
                            ? (MARITAL_STATUS_LABELS[profile.maritalStatus] ??
                              profile.maritalStatus)
                            : null
                        }
                      />
                      <InfoRow icon="briefcase" label="Profession" value={profile.job} />
                      <InfoRow
                        icon="heart"
                        label="Religion"
                        value={
                          profile.religion
                            ? (RELIGION_LABELS[profile.religion] ?? profile.religion)
                            : null
                        }
                      />
                      <InfoRow
                        icon="user-plus"
                        label="Souhaite des enfants"
                        value={
                          profile.wantsChildren
                            ? (WANTS_CHILDREN_LABELS[profile.wantsChildren] ??
                              profile.wantsChildren)
                            : null
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Ce que je recherche — real intent + dealbreakers +
                    interestedIn, all inline editable (moved here from
                    /app/parametres/preferences, 2026-08-14 second pass). */}
                <div className="rounded-xl border border-border bg-surface p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="font-headings text-base font-bold text-foreground">
                      Ce que je recherche
                    </p>
                    {!editingSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchDraft({
                            intent: profile.intent,
                            interestedIn: profile.interestedIn ?? '',
                            dealbreakers: profile.dealbreakers ?? '',
                          });
                          setEditingSearch(true);
                        }}
                        className="flex items-center gap-1 rounded-lg border border-primary px-2.5 py-1 font-body text-xs text-primary"
                      >
                        <Icon name="pencil" size={11} />
                        Modifier
                      </button>
                    )}
                  </div>

                  {editingSearch ? (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="font-body text-xs text-muted-foreground">
                            Type de relation recherchée
                          </span>
                          <select
                            value={searchDraft.intent}
                            onChange={(e) =>
                              setSearchDraft((d) => ({ ...d, intent: e.target.value }))
                            }
                            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
                          >
                            {INTENT_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="font-body text-xs text-muted-foreground">
                            Je souhaite voir
                          </span>
                          <select
                            value={searchDraft.interestedIn}
                            onChange={(e) =>
                              setSearchDraft((d) => ({ ...d, interestedIn: e.target.value }))
                            }
                            className="rounded-lg border border-border bg-background px-3 py-2 font-body text-sm text-foreground"
                          >
                            <option value="">Par défaut (sexe opposé)</option>
                            {INTERESTED_IN_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="font-body text-xs text-muted-foreground">
                          Ce que je n&rsquo;accepte pas
                        </span>
                        <textarea
                          value={searchDraft.dealbreakers}
                          onChange={(e) =>
                            setSearchDraft((d) => ({ ...d, dealbreakers: e.target.value }))
                          }
                          maxLength={300}
                          rows={3}
                          className="w-full rounded-lg border border-border bg-background p-3 font-body text-sm text-foreground"
                          placeholder="Le manque de sincérité, l'infidélité…"
                        />
                      </label>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingSearch(false)}
                          className="rounded-lg px-3 py-1.5 font-body text-xs text-muted-foreground"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveSearch()}
                          disabled={savingSearch}
                          className="rounded-lg bg-primary px-4 py-1.5 font-body text-xs font-bold text-primary-foreground disabled:opacity-50"
                        >
                          {savingSearch ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <InfoRow
                        icon="gem"
                        label="Type de relation recherchée"
                        value={INTENT_LABELS[profile.intent] ?? profile.intent}
                      />
                      <div className="mt-4">
                        <p className="mb-2 font-body text-xs text-muted-foreground">
                          Ce que je n&rsquo;accepte pas
                        </p>
                        <p className="font-body text-sm text-foreground">
                          {profile.dealbreakers ?? (
                            <span className="text-muted-foreground">Pas encore renseigné.</span>
                          )}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Right sidebar */}
              <div className="flex flex-col gap-5">
                {/* Verification — admin-manual-approval only (see
                    STATUS.md), no self-service submit flow exists anywhere
                    in the app. The link below intentionally reads "Voir le
                    statut" (was "Finaliser la vérification", a CTA implying
                    an action the user can't actually take) and only routes
                    to the passive status row on Compte. */}
                <div className="rounded-xl border border-border bg-surface p-5">
                  <p className="mb-4 font-headings text-base font-bold text-foreground">
                    Vérification
                  </p>
                  {profile.verificationStatus === 'VERIFIED' ? (
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-verified/10 px-3 py-2.5">
                      <Icon name="check-circle" size={16} className="text-verified" />
                      <span className="font-body text-sm text-foreground">
                        Ton profil est vérifié
                      </span>
                    </div>
                  ) : profile.verificationStatus === 'REJECTED' ? (
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2.5">
                      <Icon name="info" size={16} className="text-red-500" />
                      <span className="font-body text-sm text-foreground">
                        Vérification refusée — contacte le support
                      </span>
                    </div>
                  ) : (
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5">
                      <Icon name="clock" size={16} className="text-muted-foreground" />
                      <span className="font-body text-sm text-muted-foreground">
                        En attente de vérification
                      </span>
                    </div>
                  )}
                  {profile.verificationStatus !== 'VERIFIED' && (
                    <Link
                      href="/app/parametres/compte"
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 font-body text-sm font-medium text-foreground"
                    >
                      <Icon name="eye" size={14} />
                      Voir le statut de vérification
                    </Link>
                  )}
                </div>

                {/* Stats */}
                {stats && (
                  <div className="rounded-xl border border-border bg-surface p-5">
                    <p className="mb-4 font-headings text-base font-bold text-foreground">
                      Mes statistiques
                    </p>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-body text-sm text-muted-foreground">
                          <Icon name="eye" size={14} />
                          Visiteurs
                        </div>
                        <span className="font-headings text-base font-bold text-foreground">
                          {stats.visitorsCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-body text-sm text-muted-foreground">
                          <Icon name="heart" size={14} />
                          Mis en favori
                        </div>
                        <span className="font-headings text-base font-bold text-foreground">
                          {stats.favoritedByCount}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-body text-sm text-muted-foreground">
                          <Icon name="message-circle" size={14} />
                          Demandes reçues
                        </div>
                        <span className="font-headings text-base font-bold text-foreground">
                          {stats.requestsReceivedCount}
                        </span>
                      </div>
                    </div>
                    <Link
                      href="/app/credits"
                      className="mt-4 flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 p-3"
                    >
                      <Icon name="zap" size={14} className="text-gold" />
                      <p className="font-body text-xs text-foreground">
                        Booste ton profil pour plus de visibilité
                      </p>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
