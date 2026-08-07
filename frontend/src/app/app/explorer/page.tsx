// Explorer — grid browse + filter panel, built mobile-first from the
// Banani "Explorer (Desktop)" screen (no mobile mockup exported for this
// screen, same caveat as Découverte).
'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { ExplorerCard } from '@/components/yeoyo/ExplorerCard';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import type { ProfileCard } from '@/lib/yeoyo/types';

interface ExplorerFilters {
  gender?: 'HOMME' | 'FEMME' | undefined;
  ageMin?: number | undefined;
  ageMax?: number | undefined;
  religion?: string[] | undefined;
  intent?: string | undefined;
  childrenCount?: string | undefined;
}

interface ExplorerResponse {
  profiles: ProfileCard[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

const RELIGIONS = [
  { value: 'CHRETIEN', label: 'Chrétien(ne)' },
  { value: 'CATHOLIQUE', label: 'Catholique' },
  { value: 'PROTESTANT', label: 'Protestant(e)' },
  { value: 'MUSULMAN', label: 'Musulman(e)' },
];

function buildQuery(filters: ExplorerFilters, page: number): string {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.gender) params.set('gender', filters.gender);
  if (filters.ageMin !== undefined) params.set('ageMin', String(filters.ageMin));
  if (filters.ageMax !== undefined) params.set('ageMax', String(filters.ageMax));
  if (filters.religion && filters.religion.length > 0) {
    params.set('religion', filters.religion.join(','));
  }
  if (filters.intent) params.set('intent', filters.intent);
  if (filters.childrenCount) params.set('childrenCount', filters.childrenCount);
  return params.toString();
}

function ExplorerContent() {
  const user = useUser();
  const router = useRouter();
  const badgeCounts = useNavCounts();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<ExplorerFilters>(() => {
    const gender = searchParams.get('gender');
    const intent = searchParams.get('intent');
    return {
      ...(gender === 'HOMME' || gender === 'FEMME' ? { gender } : {}),
      ...(intent ? { intent } : {}),
    };
  });
  const [draftAgeMin, setDraftAgeMin] = useState('25');
  const [draftAgeMax, setDraftAgeMax] = useState('45');
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

  const load = useCallback(
    async (nextFilters: ExplorerFilters, nextPage: number, append: boolean) => {
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
    },
    [],
  );

  // Re-fetch whenever the applied filters object changes.
  useEffect(() => {
    if (user) void load(filters, 1, false);
  }, [user, filters, load]);

  function setChip(next: Partial<ExplorerFilters>) {
    setFilters((f) => ({ ...f, ...next }));
  }

  function applyPanel() {
    setFilters((f) => ({
      ...f,
      ageMin: draftAgeMin ? Number(draftAgeMin) : undefined,
      ageMax: draftAgeMax ? Number(draftAgeMax) : undefined,
      religion: draftReligion.length > 0 ? draftReligion : undefined,
      childrenCount: draftChildren,
    }));
  }

  function reset() {
    setDraftAgeMin('');
    setDraftAgeMax('');
    setDraftReligion([]);
    setDraftChildren(undefined);
    setFilters({});
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

  function onDismiss(targetUserId: string) {
    // Client-side only — this app doesn't persist "passes" in v1, so a
    // dismissed card can reappear on a later fetch. Revisit if profiles
    // need to stay excluded once passed.
    setProfiles((prev) => prev.filter((p) => p.userId !== targetUserId));
  }

  if (!user) return null;

  return (
    <AppShell active="explorer" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <div className="flex flex-col lg:flex-row">
        <div className="flex-1">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <h1 className="font-headings text-xl font-bold text-foreground">Explorer</h1>
              <p className="mt-0.5 font-body text-sm text-muted-foreground">
                {total} profils vérifiés à Kinshasa
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3 lg:px-8">
            <button
              type="button"
              onClick={() => setChip({ gender: undefined })}
              className={`rounded-xl border px-3 py-1.5 font-body text-sm font-medium ${!filters.gender ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground'}`}
            >
              Tout Kinshasa
            </button>
            <button
              type="button"
              onClick={() => setChip({ gender: 'FEMME' })}
              className={`rounded-xl border px-3 py-1.5 font-body text-sm font-medium ${filters.gender === 'FEMME' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground'}`}
            >
              Femmes
            </button>
            <button
              type="button"
              onClick={() => setChip({ gender: 'HOMME' })}
              className={`rounded-xl border px-3 py-1.5 font-body text-sm font-medium ${filters.gender === 'HOMME' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground'}`}
            >
              Hommes
            </button>
            <button
              type="button"
              onClick={() =>
                setChip({ intent: filters.intent === 'COURT_TERME' ? undefined : 'COURT_TERME' })
              }
              className={`rounded-xl border px-3 py-1.5 font-body text-sm font-medium ${filters.intent === 'COURT_TERME' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground'}`}
            >
              Mariage rapide
            </button>
            <button
              type="button"
              onClick={reset}
              className="ml-auto flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 font-body text-sm font-medium text-primary"
            >
              <Icon name="x" size={13} />
              Réinitialiser
            </button>
          </div>

          <div className="px-5 py-6 lg:px-8">
            {loading && profiles.length === 0 && (
              <p className="font-body text-sm text-muted-foreground">Chargement…</p>
            )}
            {error && errorCode === 'PROFILE_REQUIRED' && (
              <div className="rounded-lg border border-border bg-surface p-8 text-center">
                <p className="font-body text-sm text-muted-foreground">
                  Complète ton profil pour explorer les membres.
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
                <ExplorerCard
                  key={p.userId}
                  profile={p}
                  onLike={onLike}
                  onMessage={onMessage}
                  onDismiss={onDismiss}
                  liking={liking}
                />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void load(filters, page + 1, true)}
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface px-8 py-3 font-body text-sm font-medium text-foreground disabled:opacity-50"
                >
                  <Icon name="refresh-cw" size={15} />
                  Charger plus de profils
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="w-full flex-shrink-0 border-t border-border bg-surface lg:w-64 lg:border-l lg:border-t-0">
          <div className="border-b border-border px-5 py-5">
            <h2 className="font-headings text-sm font-semibold text-foreground">Filtres actifs</h2>
            <p className="mt-0.5 font-body text-xs text-muted-foreground">Affine ta recherche</p>
          </div>
          <div className="flex flex-col gap-5 p-5">
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
                  Sans
                </button>
                <button
                  type="button"
                  disabled
                  className="flex-1 rounded-lg border border-border py-2 font-body text-xs font-medium text-muted-foreground opacity-50"
                  title="Filtrer par nombre d'enfants précis via l'âge/religion pour l'instant"
                >
                  Avec
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={applyPanel}
              className="mt-2 rounded-lg bg-primary py-3 font-headings text-sm font-semibold text-primary-foreground"
            >
              Appliquer
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// useSearchParams() requires a Suspense boundary under the App Router.
export default function ExplorerPage() {
  return (
    <Suspense fallback={null}>
      <ExplorerContent />
    </Suspense>
  );
}
