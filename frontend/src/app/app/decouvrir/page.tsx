// Découverte Profils — rebuilt from a Banani re-fetch (2026-08-07). The
// original Phase C implementation (2026-07-30) only reproduced the right
// "Profil du jour" panel and missed that the real screen is a full grid of
// profiles with a filter bar, matching Explorer's own patterns — this file
// now mirrors that: grid + chips + filter panel on the left, the single
// featured profile + compatibility score on the right (`lg:` two-column
// split, stacked full-width on mobile/tablet). See
// .planning/banani/decouverte-profils-v2.md for the full plan + the three
// decisions confirmed with the user (message CTA stays as-is, search stays
// decorative, filters panel reuses Explorer's fields).
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { ProfileDetailCard } from '@/components/yeoyo/ProfileDetailCard';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import type { ProfileCard } from '@/lib/yeoyo/types';

interface Filters {
  gender?: 'HOMME' | 'FEMME' | undefined;
  commune?: string | undefined;
  intent?: string | undefined;
  religion?: string[] | undefined;
  ageMin?: number | undefined;
  ageMax?: number | undefined;
  childrenCount?: string | undefined;
}

interface ExplorerResponse {
  profiles: ProfileCard[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

interface DiscoverResponse {
  profile: ProfileCard | null;
  compatibility?: {
    score: number;
    sameCommune: boolean;
    sameReligion: boolean;
    sameIntent: boolean;
  };
}

const RELIGIONS = [
  { value: 'CHRETIEN', label: 'Chrétien(ne)' },
  { value: 'CATHOLIQUE', label: 'Catholique' },
  { value: 'PROTESTANT', label: 'Protestant(e)' },
  { value: 'MUSULMAN', label: 'Musulman(e)' },
];

function buildQuery(filters: Filters, page: number): string {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.gender) params.set('gender', filters.gender);
  if (filters.commune) params.set('commune', filters.commune);
  if (filters.intent) params.set('intent', filters.intent);
  if (filters.religion && filters.religion.length > 0) {
    params.set('religion', filters.religion.join(','));
  }
  if (filters.ageMin !== undefined) params.set('ageMin', String(filters.ageMin));
  if (filters.ageMax !== undefined) params.set('ageMax', String(filters.ageMax));
  if (filters.childrenCount) params.set('childrenCount', filters.childrenCount);
  return params.toString();
}

export default function DecouvrirPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();

  const [filters, setFilters] = useState<Filters>({});
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [draftAgeMin, setDraftAgeMin] = useState('');
  const [draftAgeMax, setDraftAgeMax] = useState('');
  const [draftReligion, setDraftReligion] = useState<string[]>([]);
  const [draftChildren, setDraftChildren] = useState<'0' | undefined>(undefined);

  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [liking, setLiking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const [featured, setFeatured] = useState<DiscoverResponse | null>(null);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  const loadGrid = useCallback(async (nextFilters: Filters, nextPage: number, append: boolean) => {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const res = await api<ExplorerResponse>(
        `/api/profiles/explorer?${buildQuery(nextFilters, nextPage)}`,
      );
      setProfiles((prev) => (append ? [...prev, ...res.profiles] : res.profiles));
      setPage(res.page);
      setTotal(res.total);
      setHasMore(res.hasMore);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrorCode(err.code);
      } else {
        setError('Une erreur est survenue');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFeatured = useCallback(async () => {
    setFeaturedLoading(true);
    try {
      const res = await api<DiscoverResponse>('/api/profiles/discover');
      setFeatured(res);
    } catch {
      setFeatured(null);
    } finally {
      setFeaturedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadGrid(filters, 1, false);
  }, [user, filters, loadGrid]);

  useEffect(() => {
    if (user) void loadFeatured();
  }, [user, loadFeatured]);

  function setChip(next: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...next }));
  }

  function applyFilterPanel() {
    setFilters((f) => ({
      ...f,
      ageMin: draftAgeMin ? Number(draftAgeMin) : undefined,
      ageMax: draftAgeMax ? Number(draftAgeMax) : undefined,
      religion: draftReligion.length > 0 ? draftReligion : undefined,
      childrenCount: draftChildren,
    }));
    setShowFilterPanel(false);
  }

  async function onLike(targetUserId: string) {
    setLiking(true);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      toast('Profil aimé — une demande de contact a été envoyée', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLiking(false);
    }
  }

  async function onMessage(targetUserId: string) {
    setLiking(true);
    try {
      const res = await api<{ conversationId: string }>('/api/likes', {
        method: 'POST',
        body: { targetUserId },
      });
      router.push(`/app/messages/${res.conversationId}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLiking(false);
    }
  }

  if (!user) return null;

  return (
    <AppShell active="decouvrir" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <div className="flex flex-col lg:flex-row">
        <div className="flex-1">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <h1 className="font-headings text-xl font-bold text-foreground">Découvrir</h1>
              <p className="mt-0.5 font-body text-sm text-muted-foreground">
                Profils vérifiés près de toi à Kinshasa
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 lg:w-56 lg:flex-none">
                <Icon name="search" size={16} />
                <span className="font-body text-sm text-muted-foreground">Rechercher...</span>
              </div>
              <button
                type="button"
                onClick={() => setShowFilterPanel((v) => !v)}
                className="flex flex-shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2"
              >
                <Icon name="sliders-horizontal" size={16} />
                <span className="font-body text-sm text-foreground">Filtres</span>
              </button>
            </div>
          </div>

          {showFilterPanel && (
            <div className="flex flex-col gap-5 border-b border-border bg-surface px-5 py-5 lg:px-8">
              <div className="flex items-center justify-between">
                <h2 className="font-headings text-sm font-semibold text-foreground">
                  Filtres avancés
                </h2>
                <button type="button" onClick={() => setShowFilterPanel(false)} aria-label="Fermer">
                  <Icon name="x" size={16} />
                </button>
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block font-body text-xs uppercase tracking-widest text-muted-foreground">
                    Âge
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={18}
                      value={draftAgeMin}
                      onChange={(e) => setDraftAgeMin(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center font-body text-sm text-foreground"
                    />
                    <span className="text-muted-foreground">—</span>
                    <input
                      type="number"
                      min={18}
                      value={draftAgeMax}
                      onChange={(e) => setDraftAgeMax(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center font-body text-sm text-foreground"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block font-body text-xs uppercase tracking-widest text-muted-foreground">
                    Religion
                  </label>
                  <div className="flex flex-col gap-1.5">
                    {RELIGIONS.map((r) => {
                      const checked = draftReligion.includes(r.value);
                      return (
                        <button
                          type="button"
                          key={r.value}
                          onClick={() =>
                            setDraftReligion((prev) =>
                              checked ? prev.filter((v) => v !== r.value) : [...prev, r.value],
                            )
                          }
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left ${checked ? 'border-primary bg-secondary/20' : 'border-border bg-background'}`}
                        >
                          <div
                            className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded ${checked ? 'bg-primary' : 'border border-border'}`}
                          >
                            {checked && <Icon name="check" size={11} />}
                          </div>
                          <span className="font-body text-sm text-foreground">{r.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block font-body text-xs uppercase tracking-widest text-muted-foreground">
                    Enfants
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDraftChildren(draftChildren === '0' ? undefined : '0')}
                      className={`flex-1 rounded-lg border py-2 font-body text-xs font-medium ${draftChildren === '0' ? 'border-primary bg-secondary/20 text-foreground' : 'border-border text-muted-foreground'}`}
                    >
                      Sans enfant
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={applyFilterPanel}
                className="self-start rounded-lg bg-primary px-6 py-2.5 font-headings text-sm font-semibold text-primary-foreground"
              >
                Appliquer
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4 lg:px-8">
            <button
              type="button"
              onClick={() => setChip({ gender: undefined })}
              className={`rounded-xl border px-4 py-1.5 font-body text-sm font-medium ${!filters.gender ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground'}`}
            >
              Tous
            </button>
            <button
              type="button"
              onClick={() => setChip({ gender: 'FEMME' })}
              className={`rounded-xl border px-4 py-1.5 font-body text-sm font-medium ${filters.gender === 'FEMME' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground'}`}
            >
              Femmes
            </button>
            <button
              type="button"
              onClick={() => setChip({ gender: 'HOMME' })}
              className={`rounded-xl border px-4 py-1.5 font-body text-sm font-medium ${filters.gender === 'HOMME' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground'}`}
            >
              Hommes
            </button>
            <button
              type="button"
              onClick={() =>
                setChip({ intent: filters.intent === 'COURT_TERME' ? undefined : 'COURT_TERME' })
              }
              className={`rounded-xl border px-4 py-1.5 font-body text-sm font-medium ${filters.intent === 'COURT_TERME' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground'}`}
            >
              Mariage rapide
            </button>
            <button
              type="button"
              onClick={() =>
                setChip({ commune: filters.commune === 'Gombe' ? undefined : 'Gombe' })
              }
              className={`rounded-xl border px-4 py-1.5 font-body text-sm font-medium ${filters.commune === 'Gombe' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground'}`}
            >
              Kinshasa-Gombe
            </button>
            <button
              type="button"
              onClick={() =>
                setChip({
                  religion: filters.religion?.includes('CHRETIEN') ? undefined : ['CHRETIEN'],
                })
              }
              className={`rounded-xl border px-4 py-1.5 font-body text-sm font-medium ${filters.religion?.includes('CHRETIEN') ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground'}`}
            >
              Chrétien(ne)
            </button>
            <div className="ml-auto flex items-center gap-1.5 text-muted-foreground">
              <Icon name="users" size={15} />
              <span className="font-body text-sm">
                <span className="font-semibold text-foreground">{total}</span> profils actifs
              </span>
            </div>
          </div>

          <div className="px-5 py-6 lg:px-8">
            {loading && profiles.length === 0 && (
              <p className="font-body text-sm text-muted-foreground">Chargement…</p>
            )}
            {error && errorCode === 'PROFILE_REQUIRED' && (
              <div className="rounded-lg border border-border bg-surface p-8 text-center">
                <p className="font-body text-sm text-muted-foreground">
                  Complète ton profil pour découvrir des membres.
                </p>
                <Link
                  href="/onboarding"
                  className="mt-4 inline-block rounded-xl bg-primary px-6 py-2.5 font-headings text-sm font-semibold text-primary-foreground"
                >
                  Compléter mon profil
                </Link>
              </div>
            )}
            {error && errorCode !== 'PROFILE_REQUIRED' && (
              <p role="alert" className="font-body text-sm text-red-500">
                {error}
              </p>
            )}
            {!error && profiles.length === 0 && !loading && (
              <p className="font-body text-sm text-muted-foreground">
                Aucun profil ne correspond à ces filtres.
              </p>
            )}

            <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {profiles.map((p) => (
                <ProfileDetailCard
                  key={p.userId}
                  profile={p}
                  onLike={onLike}
                  onMessage={onMessage}
                  liking={liking}
                />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void loadGrid(filters, page + 1, true)}
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface px-8 py-3 font-body text-sm font-medium text-foreground disabled:opacity-50"
                >
                  <Icon name="refresh-cw" size={15} />
                  Voir plus de profils
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="w-full flex-shrink-0 border-t border-border bg-surface lg:w-72 lg:border-l lg:border-t-0">
          <div className="border-b border-border px-5 py-5">
            <h2 className="font-headings text-sm font-semibold text-foreground">Profil du jour</h2>
            <p className="mt-0.5 font-body text-xs text-muted-foreground">
              Mise en avant par YeOyo
            </p>
          </div>
          <div className="flex flex-col gap-4 p-5">
            {featuredLoading && (
              <p className="font-body text-sm text-muted-foreground">Chargement…</p>
            )}
            {!featuredLoading && featured?.profile && (
              <>
                <ProfileDetailCard
                  profile={featured.profile}
                  onLike={onLike}
                  onMessage={onMessage}
                  liking={liking}
                />
                {featured.compatibility && (
                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                        Compatibilité
                      </span>
                      <span className="font-headings text-lg font-bold text-primary">
                        {featured.compatibility.score}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${featured.compatibility.score}%` }}
                      />
                    </div>
                    <div className="mt-3 flex flex-col gap-1.5">
                      {featured.compatibility.sameCommune && (
                        <div className="flex items-center gap-2">
                          <Icon name="check" size={13} />
                          <span className="font-body text-xs text-muted-foreground">
                            Même quartier
                          </span>
                        </div>
                      )}
                      {featured.compatibility.sameReligion && (
                        <div className="flex items-center gap-2">
                          <Icon name="check" size={13} />
                          <span className="font-body text-xs text-muted-foreground">Même foi</span>
                        </div>
                      )}
                      {featured.compatibility.sameIntent && (
                        <div className="flex items-center gap-2">
                          <Icon name="check" size={13} />
                          <span className="font-body text-xs text-muted-foreground">
                            Intention identique
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            {!featuredLoading && !featured?.profile && (
              <p className="font-body text-sm text-muted-foreground">
                Aucun profil vedette pour l&rsquo;instant.
              </p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
