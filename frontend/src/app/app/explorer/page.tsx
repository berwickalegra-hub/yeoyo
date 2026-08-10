// Explorer — the "decide fast" swipe deck (moved here 2026-08-10, product
// decision from chat inspired by a reference dating app's swipe-first
// layout: the app's landing tab should be a home/dashboard, and the
// deliberate "zapper gauche/droite" gesture belongs on Explorer instead).
// One profile at a time, swipe left to pass / right to like (or use the
// action row), same GET /api/profiles/explorer backing as before — the
// client just holds a deck + pointer instead of rendering a grid. This is
// a straight move of what used to live at /app/decouvrir; see
// components/yeoyo/SwipeCard.tsx for the swipe-gesture + mobile-fixed
// action bar implementation.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SwipeCard } from '@/components/yeoyo/SwipeCard';
import { ProfileGridCard } from '@/components/yeoyo/ProfileGridCard';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import type { ProfileCard } from '@/lib/yeoyo/types';

type ViewMode = 'swipe' | 'grid';

interface Filters {
  gender?: 'HOMME' | 'FEMME' | undefined;
  religion?: string[] | undefined;
  ageMin?: number | undefined;
  ageMax?: number | undefined;
  childrenCount?: string | undefined;
}

interface ExplorerResponse {
  profiles: ProfileCard[];
  page: number;
  hasMore: boolean;
}

const RELIGIONS = [
  { value: 'CHRETIEN', label: 'Chrétien(ne)' },
  { value: 'CATHOLIQUE', label: 'Catholique' },
  { value: 'PROTESTANT', label: 'Protestant(e)' },
  { value: 'MUSULMAN', label: 'Musulman(e)' },
];

const DECK_PAGE_SIZE = 10;

function buildQuery(filters: Filters, page: number): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(DECK_PAGE_SIZE) });
  if (filters.gender) params.set('gender', filters.gender);
  if (filters.religion && filters.religion.length > 0) {
    params.set('religion', filters.religion.join(','));
  }
  if (filters.ageMin !== undefined) params.set('ageMin', String(filters.ageMin));
  if (filters.ageMax !== undefined) params.set('ageMax', String(filters.ageMax));
  if (filters.childrenCount) params.set('childrenCount', filters.childrenCount);
  return params.toString();
}

export default function ExplorerPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();

  const [viewMode, setViewMode] = useState<ViewMode>('swipe');
  const [filters, setFilters] = useState<Filters>({});
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [draftGender, setDraftGender] = useState<'HOMME' | 'FEMME' | undefined>(undefined);
  const [draftAgeMin, setDraftAgeMin] = useState('');
  const [draftAgeMax, setDraftAgeMax] = useState('');
  const [draftReligion, setDraftReligion] = useState<string[]>([]);
  const [draftChildren, setDraftChildren] = useState<'0' | undefined>(undefined);

  const [deck, setDeck] = useState<ProfileCard[]>([]);
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const loadDeck = useCallback(async (nextFilters: Filters) => {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const res = await api<ExplorerResponse>(
        `/api/profiles/explorer?${buildQuery(nextFilters, 1)}`,
      );
      setDeck(res.profiles);
      setIndex(0);
      setPage(res.page);
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

  useEffect(() => {
    if (user) void loadDeck(filters);
  }, [user, filters, loadDeck]);

  async function loadMore() {
    if (!hasMore) return;
    try {
      const res = await api<ExplorerResponse>(
        `/api/profiles/explorer?${buildQuery(filters, page + 1)}`,
      );
      setDeck((prev) => [...prev, ...res.profiles]);
      setPage(res.page);
      setHasMore(res.hasMore);
    } catch {
      // silent — the deck just won't grow past what's already loaded
    }
  }

  async function topUpIfNeeded(nextIndex: number) {
    if (nextIndex < deck.length - 2 || !hasMore) return;
    await loadMore();
  }

  function advance() {
    const next = index + 1;
    setIndex(next);
    void topUpIfNeeded(next);
  }

  function onDismiss() {
    advance();
  }

  async function onLike(targetUserId: string) {
    setBusy(true);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      toast('Profil aimé — une demande de contact a été envoyée', 'success');
      advance();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onMessage(targetUserId: string) {
    setBusy(true);
    try {
      const res = await api<{ conversationId: string }>('/api/likes', {
        method: 'POST',
        body: { targetUserId },
      });
      router.push(`/app/messages/${res.conversationId}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusy(false);
    }
  }

  // Grid mode — no single-card pointer, so actions don't "advance"; dismiss
  // just removes the card from the currently-loaded grid.
  function onDismissGrid(targetUserId: string) {
    setDeck((prev) => prev.filter((p) => p.userId !== targetUserId));
  }

  async function onLikeGrid(targetUserId: string) {
    setBusy(true);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      toast('Profil aimé — une demande de contact a été envoyée', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onMessageGrid(targetUserId: string) {
    setBusy(true);
    try {
      const res = await api<{ conversationId: string }>('/api/likes', {
        method: 'POST',
        body: { targetUserId },
      });
      router.push(`/app/messages/${res.conversationId}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusy(false);
    }
  }

  function openFilterPanel() {
    setDraftGender(filters.gender);
    setDraftAgeMin(filters.ageMin !== undefined ? String(filters.ageMin) : '');
    setDraftAgeMax(filters.ageMax !== undefined ? String(filters.ageMax) : '');
    setDraftReligion(filters.religion ?? []);
    setDraftChildren(filters.childrenCount === '0' ? '0' : undefined);
    setShowFilterPanel(true);
  }

  function applyFilterPanel() {
    setFilters({
      gender: draftGender,
      ageMin: draftAgeMin ? Number(draftAgeMin) : undefined,
      ageMax: draftAgeMax ? Number(draftAgeMax) : undefined,
      religion: draftReligion.length > 0 ? draftReligion : undefined,
      childrenCount: draftChildren,
    });
    setShowFilterPanel(false);
  }

  if (!user) return null;

  const current = deck[index];

  return (
    <AppShell active="explorer" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <div className="sticky top-0 z-20 animate-fade-in-down bg-background/95 shadow-sm backdrop-blur-sm">
        <div className="border-b border-border px-5 py-4 text-center lg:px-8">
          <h1 className="font-headings text-lg font-bold text-foreground">Explorer</h1>
        </div>

        <div className="flex items-center justify-center gap-2 border-b border-border px-5 py-3">
          <button
            type="button"
            onClick={openFilterPanel}
            className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 transition-transform active:scale-95"
          >
            <Icon name="sliders-horizontal" size={15} />
            <span className="font-body text-sm font-medium text-foreground">Filtres</span>
          </button>
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1">
            <button
              type="button"
              onClick={() => setViewMode('swipe')}
              aria-label="Vue par cartes"
              aria-pressed={viewMode === 'swipe'}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${viewMode === 'swipe' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              <Icon name="layers" size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Vue en grille"
              aria-pressed={viewMode === 'grid'}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              <Icon name="layout-grid" size={15} />
            </button>
          </div>
        </div>
      </div>

      {showFilterPanel && (
        <div className="animate-scale-in mx-auto flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-headings text-sm font-semibold text-foreground">Filtres</h2>
            <button type="button" onClick={() => setShowFilterPanel(false)} aria-label="Fermer">
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="flex gap-2">
            {(
              [
                { value: undefined, label: 'Tous' },
                { value: 'FEMME', label: 'Femmes' },
                { value: 'HOMME', label: 'Hommes' },
              ] as const
            ).map((g) => (
              <button
                key={g.label}
                type="button"
                onClick={() => setDraftGender(g.value)}
                className={`flex-1 rounded-lg border py-2 font-body text-xs font-medium ${draftGender === g.value ? 'border-primary bg-secondary/20 text-foreground' : 'border-border text-muted-foreground'}`}
              >
                {g.label}
              </button>
            ))}
          </div>

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
            <button
              type="button"
              onClick={() => setDraftChildren(draftChildren === '0' ? undefined : '0')}
              className={`w-full rounded-lg border py-2 font-body text-xs font-medium ${draftChildren === '0' ? 'border-primary bg-secondary/20 text-foreground' : 'border-border text-muted-foreground'}`}
            >
              Sans enfant
            </button>
          </div>

          <button
            type="button"
            onClick={applyFilterPanel}
            className="rounded-lg bg-primary py-3 font-headings text-sm font-semibold text-primary-foreground"
          >
            Appliquer
          </button>
        </div>
      )}

      <div className="px-5 py-4 lg:px-8">
        {loading && (
          <p className="text-center font-body text-sm text-muted-foreground">Chargement…</p>
        )}

        {error && errorCode === 'PROFILE_REQUIRED' && (
          <div className="mx-auto max-w-sm rounded-lg border border-border bg-surface p-8 text-center">
            <p className="font-body text-sm text-muted-foreground">
              Complète ton profil pour explorer des membres.
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
          <p role="alert" className="text-center font-body text-sm text-red-500">
            {error}
          </p>
        )}

        {!loading && !error && viewMode === 'swipe' && current && (
          <SwipeCard
            key={current.userId}
            profile={current}
            onDismiss={onDismiss}
            onMessage={onMessage}
            onLike={onLike}
            busy={busy}
          />
        )}

        {!loading && !error && viewMode === 'swipe' && !current && (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-2 rounded-xl border border-border bg-surface p-10 text-center">
            <Icon name="layout-grid" size={28} className="text-muted-foreground" />
            <p className="font-headings text-base font-semibold text-foreground">
              Plus de profils pour l&rsquo;instant
            </p>
            <p className="font-body text-sm text-muted-foreground">
              Reviens plus tard, ou élargis tes filtres.
            </p>
            <Link
              href="/app/decouvrir"
              className="mt-3 rounded-xl bg-primary px-6 py-2.5 font-headings text-sm font-semibold text-primary-foreground"
            >
              Retour à l&rsquo;accueil
            </Link>
          </div>
        )}

        {!loading && !error && viewMode === 'grid' && deck.length > 0 && (
          <>
            <div className="animate-fade-in grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {deck.map((p) => (
                <ProfileGridCard
                  key={p.userId}
                  profile={p}
                  onLike={onLikeGrid}
                  onMessage={onMessageGrid}
                  onDismiss={onDismissGrid}
                  busy={busy}
                />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center pt-5">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface px-8 py-3 font-body text-sm font-medium text-foreground"
                >
                  <Icon name="refresh-cw" size={15} />
                  Charger plus de profils
                </button>
              </div>
            )}
          </>
        )}

        {!loading && !error && viewMode === 'grid' && deck.length === 0 && (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-2 rounded-xl border border-border bg-surface p-10 text-center">
            <Icon name="layout-grid" size={28} className="text-muted-foreground" />
            <p className="font-headings text-base font-semibold text-foreground">
              Plus de profils pour l&rsquo;instant
            </p>
            <p className="font-body text-sm text-muted-foreground">
              Reviens plus tard, ou élargis tes filtres.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
