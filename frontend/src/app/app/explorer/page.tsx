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
import { useCredits } from '@/contexts/CreditsContext';
import { Icon } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { SwipeCard } from '@/components/yeoyo/SwipeCard';
import { ProfileGridCard } from '@/components/yeoyo/ProfileGridCard';
import { RequestSentOverlay } from '@/components/yeoyo/RequestSentOverlay';
import { LimitReachedModal, type LimitReachedInfo } from '@/components/yeoyo/LimitReachedModal';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { TOPNAV_ITEMS, type NavItem } from '@/components/yeoyo/nav-items';
import type { ProfileCard } from '@/lib/yeoyo/types';

const ACCUEIL_ITEM = TOPNAV_ITEMS.find((i) => i.id === 'accueil') as NavItem;

type ViewMode = 'swipe' | 'grid';

interface StatsToday {
  likesToday: number;
  messagesToday: number;
}

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

// Loading skeleton — previously a bare "Chargement…" line with no
// animation (explicit user ask, 2026-08-14: "tiens vraiment compte des
// animations... dès qu'on arrive, le chargement ainsi"). Mirrors
// SwipeCard's own shape (rounded card, photo block, floating action row)
// so the loading state reads as "the real thing about to appear" instead
// of a generic spinner unrelated to what's coming.
function SwipeCardSkeleton() {
  return (
    <div className="animate-fade-in mx-auto flex h-[520px] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-surface md:h-full md:max-h-[680px] md:min-h-[380px]">
      <div className="h-[340px] flex-shrink-0 animate-pulse bg-muted" />
      <div className="flex flex-col gap-3 p-4">
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

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
  const { balance: creditBalance, refresh: refreshCredits } = useCredits();
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
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [favoritingUserId, setFavoritingUserId] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsToday | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<{
    icon: 'heart' | 'star' | 'zap';
    title: string;
    subtitle?: string;
  } | null>(null);
  const [limitInfo, setLimitInfo] = useState<LimitReachedInfo | null>(null);

  // The two CONTACT_REQUEST_QUOTA_EXCEEDED / INSUFFICIENT_CREDITS blockers
  // are the only errors that get the persistent modal — everything else
  // (network hiccup, validation) stays a transient toast, per the explicit
  // user distinction: brief "something happened" notices vs. a hard stop
  // that needs the user to actually read it and choose what's next.
  function handleLikeError(err: unknown): void {
    if (err instanceof ApiError && err.code === 'CONTACT_REQUEST_QUOTA_EXCEEDED') {
      // Daily cap now (2026-08-30, explicit user ask — was monthly), so the
      // reset is always "tomorrow": no need for the exact calendar date the
      // monthly version showed.
      setLimitInfo({
        icon: 'lock',
        title: 'Limite quotidienne atteinte',
        message:
          'Tu as envoyé tes 10 demandes gratuites d’aujourd’hui. Reviens demain pour continuer.',
        cardMessage: 'Demandes du jour terminées — reviens demain',
        primaryAction: { label: 'Quitter Découvrir', onClick: () => router.push('/app/decouvrir') },
        dismissLabel: 'Continuer à parcourir',
      });
    } else if (err instanceof ApiError && err.code === 'INSUFFICIENT_CREDITS') {
      setLimitInfo({
        icon: 'gem',
        title: 'Crédits insuffisants',
        message: 'Il te faut plus de crédits pour envoyer ce message flash.',
        primaryAction: { label: 'Acheter des crédits', href: '/app/credits' },
        dismissLabel: 'Plus tard',
      });
    } else {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

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

  useEffect(() => {
    if (!user) return;
    api<StatsToday>('/api/profile/stats-today')
      .then(setStats)
      .catch(() => {
        /* side-panel stat, non-critical */
      });
  }, [user]);

  async function onFavorite(targetUserId: string) {
    setFavoritingUserId(targetUserId);
    const alreadyFavorited = deck.find((p) => p.userId === targetUserId)?.favorited ?? false;
    try {
      if (alreadyFavorited) {
        await api('/api/favorites', { method: 'DELETE', body: { targetUserId } });
        setOverlay({ icon: 'star', title: 'Retiré des favoris' });
      } else {
        await api('/api/favorites', { method: 'POST', body: { targetUserId } });
        setOverlay({ icon: 'star', title: 'Ajouté aux favoris' });
      }
      setDeck((prev) =>
        prev.map((p) => (p.userId === targetUserId ? { ...p, favorited: !alreadyFavorited } : p)),
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setFavoritingUserId(null);
    }
  }

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

  // Returns true only when the request actually went through — SwipeCard
  // waits for that before playing the slide-off + advancing, so the
  // "Demande envoyée" confirmation never lands on the next profile
  // (2026-08-31, explicit user report).
  async function onLike(targetUserId: string): Promise<boolean> {
    setBusyUserId(targetUserId);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      setDeck((prev) => prev.map((p) => (p.userId === targetUserId ? { ...p, liked: true } : p)));
      setOverlay({
        icon: 'heart',
        title: 'Demande envoyée !',
        subtitle: 'On te préviendra si elle ou il accepte.',
      });
      return true;
    } catch (err) {
      handleLikeError(err);
      return false;
    } finally {
      setBusyUserId(null);
    }
  }

  async function onFlash(targetUserId: string, message: string): Promise<boolean> {
    setBusyUserId(targetUserId);
    try {
      await api('/api/likes', {
        method: 'POST',
        body: { targetUserId, flashMessageBody: message },
      });
      setDeck((prev) => prev.map((p) => (p.userId === targetUserId ? { ...p, liked: true } : p)));
      setOverlay({
        icon: 'zap',
        title: 'Message flash envoyé !',
        subtitle: 'Ton message a été transmis avec ta demande.',
      });
      void refreshCredits();
      return true;
    } catch (err) {
      handleLikeError(err);
      return false;
    } finally {
      setBusyUserId(null);
    }
  }

  // Grid mode — no single-card pointer, so actions don't "advance"; dismiss
  // just removes the card from the currently-loaded grid.
  function onDismissGrid(targetUserId: string) {
    setDeck((prev) => prev.filter((p) => p.userId !== targetUserId));
  }

  async function onLikeGrid(targetUserId: string) {
    setBusyUserId(targetUserId);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      // Grid mode shows every card at once (unlike swipe mode, which
      // advances past the liked card automatically) — remove it so a
      // pending request never sits there with a toggleable heart.
      setDeck((prev) => prev.filter((p) => p.userId !== targetUserId));
      setOverlay({
        icon: 'heart',
        title: 'Demande envoyée !',
        subtitle: 'On te préviendra si elle ou il accepte.',
      });
    } catch (err) {
      handleLikeError(err);
    } finally {
      setBusyUserId(null);
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
    <AppShell
      active="decouvrir"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
      showCoach={false}
      compactMobileNav
      hideMobileAccueilBar
      hideTopStripOnMobile
    >
      {/* This page owns its own full-height layout (2026-08-19, explicit
          user report of a double-scroll conflict on the swipe deck): the
          outer page no longer scrolls at all — only the deck's own
          photo/info region does, or the grid/filter panel when they're the
          active view. Without this, the old sticky "Explorer" title bar +
          filter row could push the fixed-height SwipeCard just past the
          viewport, so both the document AND the card's internal region
          became scrollable at once. */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-shrink-0 animate-fade-in-down bg-background/95">
          <div className="flex items-center justify-center gap-2 border-b border-border px-5 py-3">
            {/* 2026-08-28 experiment (explicit user ask): Accueil moved here
                from the bottom bar (see MobileTabBar's `variant="none"` /
                AppShell's `hideMobileAccueilBar`), mobile only — desktop
                already reaches Accueil via TopNav. */}
            <Link
              href={ACCUEIL_ITEM.href}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-muted-foreground transition-transform active:scale-95 md:hidden"
            >
              <Icon name={ACCUEIL_ITEM.icon} size={15} />
              <span className="font-body text-sm font-medium">Accueil</span>
            </Link>
            <button
              type="button"
              onClick={openFilterPanel}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 transition-transform active:scale-95"
            >
              <Icon name="sliders-horizontal" size={15} />
              <span className="font-body text-sm font-medium text-foreground">Filtres</span>
            </button>
            <div className="flex items-center overflow-hidden rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setViewMode('swipe')}
                aria-label="Vue par cartes"
                aria-pressed={viewMode === 'swipe'}
                className={`flex h-8 w-8 items-center justify-center transition-colors ${viewMode === 'swipe' ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted-foreground'}`}
              >
                <Icon name="layers" size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-label="Vue en grille"
                aria-pressed={viewMode === 'grid'}
                className={`flex h-8 w-8 items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted-foreground'}`}
              >
                <Icon name="layout-grid" size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Swipe mode (filters closed, no error): mobile just scrolls this
          container normally — SwipeCard itself has no height cap or
          internal scroll on mobile anymore, and floats its action row via a
          portal (see SwipeCard.tsx) so the buttons stay on-screen
          regardless of card height. `pb-36` reserves room for that floating
          bar + MobileTabBar beneath it so the card's last content never
          hides under them. Desktop (`md:`) keeps the original non-scrolling,
          height-filling, centered treatment — the card scrolls internally
          there instead (unchanged, never had the mobile problem). Every
          other state (filter panel open, grid view, errors) uses a normal
          scrollable container, same as before. */}
        {!showFilterPanel && !error && viewMode === 'swipe' ? (
          <div className="flex-1 overflow-y-auto px-5 pb-36 pt-4 md:flex md:items-center md:justify-center md:overflow-hidden md:px-8 md:py-4">
            {loading ? (
              <SwipeCardSkeleton />
            ) : current ? (
              <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 md:h-full md:items-center lg:grid-cols-[14rem_24rem_14rem]">
                {/* Mirrors the side panel's column width so the card lands
                  dead-center under the Filtres/toggle row above, instead of
                  the whole (card + panel) block being centered as a unit —
                  which pulls the card left of that toolbar's center. */}
                <div aria-hidden="true" className="hidden lg:block" />

                <SwipeCard
                  key={current.userId}
                  profile={current}
                  onDismiss={onDismiss}
                  onLike={onLike}
                  onFlash={onFlash}
                  onAdvance={advance}
                  onFavorite={onFavorite}
                  favoriteBusy={favoritingUserId === current.userId}
                  busy={busyUserId === current.userId}
                  creditBalance={creditBalance}
                  blurred={!!limitInfo}
                  blurredMessage={limitInfo?.cardMessage}
                />

                {/* Side panel — "Filtres actifs"/"Mes stats du jour", desktop
                  only (Banani's DiscoverScreen own layout), no equivalent on
                  a phone-width swipe deck. */}
                <div className="hidden flex-col gap-4 lg:flex">
                  <div className="rounded-lg border border-border bg-surface p-4">
                    <p className="mb-3 font-headings text-sm font-semibold text-foreground">
                      Filtres actifs
                    </p>
                    <div className="flex flex-col gap-2 font-body text-xs text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>Âge</span>
                        <span className="text-foreground">
                          {filters.ageMin ?? 18} – {filters.ageMax ?? '∞'} ans
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Genre</span>
                        <span className="text-foreground">
                          {filters.gender === 'FEMME'
                            ? 'Femmes'
                            : filters.gender === 'HOMME'
                              ? 'Hommes'
                              : 'Tous'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Sans enfant</span>
                        <span className="text-foreground">
                          {filters.childrenCount === '0' ? 'Oui' : 'Non'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openFilterPanel}
                      className="mt-3 w-full rounded-lg border border-border py-2 font-body text-xs font-medium text-foreground"
                    >
                      Modifier les filtres
                    </button>
                  </div>

                  {stats && (
                    <div className="rounded-lg border border-border bg-surface p-4">
                      <p className="mb-3 font-headings text-sm font-semibold text-foreground">
                        Mes stats du jour
                      </p>
                      <div className="flex flex-col gap-2 font-body text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-secondary/10">
                            <Icon name="heart" size={13} className="text-secondary" />
                          </div>
                          <span>Ajouts</span>
                          <span className="ml-auto font-semibold text-foreground">
                            {stats.likesToday}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary/10">
                            <Icon name="message-circle" size={13} className="text-primary" />
                          </div>
                          <span>Messages envoyés</span>
                          <span className="ml-auto font-semibold text-foreground">
                            {stats.messagesToday}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="animate-fade-in-up mx-auto flex max-w-sm flex-col items-center gap-2 rounded-xl border border-border bg-surface p-10 text-center">
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
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 pb-36 pt-4 md:pb-4 lg:px-8">
            {showFilterPanel && (
              <div className="animate-scale-in mx-auto flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-headings text-sm font-semibold text-foreground">Filtres</h2>
                  <button
                    type="button"
                    onClick={() => setShowFilterPanel(false)}
                    aria-label="Fermer"
                  >
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

            {loading && viewMode === 'swipe' && <SwipeCardSkeleton />}
            {loading && viewMode === 'grid' && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface"
                  >
                    <div className="h-[200px] animate-pulse bg-muted" />
                    <div className="flex flex-col gap-2 p-4">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && errorCode === 'PROFILE_REQUIRED' && (
              <div className="animate-fade-in-up mx-auto max-w-sm rounded-lg border border-border bg-surface p-8 text-center">
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
              <p
                role="alert"
                className="animate-fade-in text-center font-body text-sm text-red-500"
              >
                {error}
              </p>
            )}

            {!loading && !error && viewMode === 'swipe' && current && (
              <div className="mx-auto grid max-w-4xl grid-cols-1 items-start gap-4 lg:grid-cols-[14rem_24rem_14rem]">
                <div aria-hidden="true" className="hidden lg:block" />
                <SwipeCard
                  key={current.userId}
                  profile={current}
                  onDismiss={onDismiss}
                  onLike={onLike}
                  onFlash={onFlash}
                  onAdvance={advance}
                  onFavorite={onFavorite}
                  favoriteBusy={favoritingUserId === current.userId}
                  busy={busyUserId === current.userId}
                  creditBalance={creditBalance}
                  blurred={!!limitInfo}
                  blurredMessage={limitInfo?.cardMessage}
                />
                <div aria-hidden="true" className="hidden lg:block" />
              </div>
            )}

            {!loading && !error && viewMode === 'swipe' && !current && (
              <div className="animate-fade-in-up mx-auto flex max-w-sm flex-col items-center gap-2 rounded-xl border border-border bg-surface p-10 text-center">
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
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {deck.map((p, i) => (
                    <div
                      key={p.userId}
                      className="animate-fade-in-up"
                      style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                    >
                      <ProfileGridCard
                        profile={p}
                        onLike={onLikeGrid}
                        onDismiss={onDismissGrid}
                        onFavorite={onFavorite}
                        favoriteBusy={favoritingUserId === p.userId}
                        busy={busyUserId === p.userId}
                      />
                    </div>
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
              <div className="animate-fade-in-up mx-auto flex max-w-sm flex-col items-center gap-2 rounded-xl border border-border bg-surface p-10 text-center">
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
        )}
      </div>
      <RequestSentOverlay
        show={!!overlay}
        onDone={() => setOverlay(null)}
        icon={overlay?.icon}
        title={overlay?.title}
        subtitle={overlay?.subtitle}
      />
      <LimitReachedModal info={limitInfo} onClose={() => setLimitInfo(null)} />
    </AppShell>
  );
}
