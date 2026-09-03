// Découvrir — the app's landing tab ("Accueil" in the Banani "Rencontres
// Sérieuses Congo" nav, see nav-items.ts's id/URL mismatch comment),
// merged with that flow's `HomeScreen.jsx` (2026-08-13,
// .planning/banani/accueil-nouveau-theme.md) per the confirmed plan: keep
// this page's real-data widgets (Banani's own version of most of them is
// hardcoded mock data — "Profil du jour", "12 nouveaux profils depuis
// hier", a static testimonial — none of which is a real design
// requirement to reproduce verbatim), reskin to the new theme (automatic —
// every widget already uses semantic tokens), and layer in the two
// concepts that now DO have real backing after Phase 1: a Visiteurs
// teaser and a Boost card.
//
// Every widget here is backed by real, already-collected data:
//   - "Sélection pour toi" has NO invented match percentage (no scoring
//     algorithm exists) — instead it shows real, derived "why recommended"
//     tags (same commune / same religion / same objectif).
//   - "Profil complété" only counts fields a user can actually go fix
//     afterwards (bio/religion/statut marital/enfants/relocalisation/
//     commune), all inline-editable on /app/profil (2026-08-14 second
//     pass — every completeness field now lives on that one page, after a
//     real bug where the same checklist was split across two pages). Photo
//     isn't counted: no post-onboarding photo-replace flow beyond
//     /app/profil's carousel existed when this metric was designed. The
//     nudge itself is dismissible (24h snooze, localStorage) and only ever
//     shows here — not duplicated on /app/profil, since a banner sitting on
//     top of the very fields it points at is redundant.
//   - "Pensée du jour" / "Conseil du jour" are curated, real content (see
//     lib/yeoyo/content.ts) — not generated.
//   - Stats reuse the same counts the nav badges / /app/likes / the new
//     /api/profile/visitors already compute.
//   - Boost card reuses the same /api/profile/boost status TopNav's own
//     Boost button reads — not a separate mock flag.
// Layout restructured 2026-08-13 (second Banani "toutes les pages" pass,
// user's explicit ask: "ajoute les widgets Banani sans enlever nos
// fonctionnalités") to match HomeScreen.jsx's actual desktop structure — a
// `w-72` sidebar (progress/upsell/boost/trust/who-liked/profil-du-jour)
// beside a main column (grid/quotes/stats) — instead of one long stacked
// mobile-width column at every breakpoint. Mobile (`<lg`) keeps the same
// stacked flow (sidebar content first, then main), unchanged in substance.
// Two widgets added, both real: `WhoLikedBanner` (real Favorite rows
// targeting me, GET /api/profile/favorited-by — blurred preview, Banani's
// own paywall pattern, not a fabricated placeholder) and "Profil du jour"
// (reuses `recommended[0]`, already-fetched real data — no new fetch, no
// invented featured-profile concept). Testimonial card still skipped
// (marketing copy, not clearly useful inside an authenticated dashboard).
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCredits } from '@/contexts/CreditsContext';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { AppShell } from '@/components/yeoyo/AppShell';
import { GuidedTour } from '@/components/yeoyo/GuidedTour';
import { HeldProfileBanner } from '@/components/yeoyo/HeldProfileBanner';
import { TOUR_STEPS, hasSeenTour, markTourSeen } from '@/lib/yeoyo/guided-tour';
import { RecommendedProfileCard } from '@/components/yeoyo/RecommendedProfileCard';
import { ProfileCardSkeleton } from '@/components/yeoyo/ProfileCardSkeleton';
import { ProfilePhotoCover } from '@/components/yeoyo/ProfilePhotoCover';
import { WhoLikedBanner } from '@/components/yeoyo/WhoLikedBanner';
import { BoostConfirmModal } from '@/components/yeoyo/BoostConfirmModal';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { periodicPick, quotesForReligion, PROFILE_TIPS } from '@/lib/yeoyo/content';
import { useCardExit } from '@/lib/yeoyo/useCardExit';
import { usePushNotifications } from '@/lib/yeoyo/usePushNotifications';
import { usePwaInstall } from '@/lib/yeoyo/usePwaInstall';
import type { ProfileCard } from '@/lib/yeoyo/types';

interface MyProfile {
  firstName: string;
  city: string;
  commune: string | null;
  religion: string | null;
  intent: string;
  bio: string | null;
  qualities: string | null;
  flaws: string | null;
  interests: string[];
  maritalStatus: string | null;
  childrenCount: string | null;
  wantsChildren: string | null;
  relocateOpen: string | null;
  visibilityPublic: boolean;
  verifiedAt: string | null;
  hasPhoto: boolean;
  photoUrl: string | null;
}

interface LikeRow {
  likeId: string;
  profile: ProfileCard;
}

interface BoostStatus {
  active: boolean;
  boostedUntil: string | null;
  cost: number;
}

interface FavoritedBy {
  preview: ProfileCard[];
  total: number;
  unrevealedCount: number;
}

interface NewNearbyCount {
  count: number;
  scope: 'commune' | 'city';
  commune: string | null;
}

const TRUST_ITEMS = [
  {
    icon: 'shield-check' as const,
    title: 'Profils vérifiés IA',
    desc: 'Chaque profil est contrôlé avant activation',
    // Banani's trust-badge rows each use a distinct icon-tile tint
    // (secondary / primary / accent) to visually separate the 3 value
    // props — not a single repeated color.
    tint: 'bg-secondary/10 text-secondary',
  },
  {
    icon: 'gem' as const,
    title: 'Intention matrimoniale déclarée',
    desc: 'Ici, tout le monde cherche le sérieux',
    tint: 'bg-primary/10 text-primary',
  },
  {
    icon: 'smartphone' as const,
    title: 'Paiement Mobile Money',
    // Generic on purpose — the hosted payment page decides which operators
    // are actually offered (same framing as /app/credits).
    desc: 'Mobile Money · Carte bancaire',
    // Banani uses text-accent here, but this project's accent token has no
    // usable foreground pair (see credits/page.tsx's bg-accent/10
    // text-primary icon tile for the same substitution).
    tint: 'bg-accent/10 text-primary',
  },
];

// "Pensée du jour" / "Conseil du jour" rotate every 12h (not once a day,
// not randomly per reload) — stable if the user reopens the app several
// times within the same 12h window, changes automatically after.
const QUOTE_ROTATION_HOURS = 12;

// The checklist behind the "Profil complété" % — kept in sync with the
// red "À compléter" markers on /app/profil (2026-08-31 explicit user ask:
// the nudge and the page should agree on what's missing). Photos, vision,
// qualités, défauts and centres d'intérêt are the parts the user cares
// about most; the rest are the softer onboarding-optional fields.
const COMPLETENESS_TEXT_FIELDS = [
  'bio',
  'qualities',
  'flaws',
  'commune',
  'religion',
  'maritalStatus',
  'childrenCount',
  'wantsChildren',
  'relocateOpen',
] as const;

function completeness(p: MyProfile): number {
  const checks = [
    p.hasPhoto,
    p.interests.length > 0,
    ...COMPLETENESS_TEXT_FIELDS.map((f) => !!p[f]),
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

// Completion nudge is dismissible (explicit user ask, 2026-08-14 second
// pass: it should only live here on Accueil, not also on Mon Profil, and
// closing it should snooze it rather than removing it permanently — it
// comes back on the next visit after 24h if the profile is still
// incomplete). localStorage, not the DB: this is a per-device UI snooze,
// not account state worth a schema field.
const COMPLETION_BANNER_DISMISS_KEY = 'yeoyo-completion-banner-dismissed-at';
// Shared 24h snooze for every dismissible banner on this page (completion,
// Premium promo, Boost promo) — closing one hides it until the next day,
// never permanently and never on an immediate reload.
const BANNER_SNOOZE_MS = 24 * 60 * 60 * 1000;
const PREMIUM_BANNER_DISMISS_KEY = 'yeoyo-premium-banner-dismissed-at';
const BOOST_BANNER_DISMISS_KEY = 'yeoyo-boost-banner-dismissed-at';
const PUSH_BANNER_DISMISS_KEY = 'yeoyo-push-banner-dismissed-at';
// Cycles the "Pourquoi faire confiance" slot between 3 variants across
// visits (trust badges / featured profile of the day / a live nearby
// stat) instead of always showing the same block — one visit = one step,
// via a small persisted counter (not random, so it doesn't reshuffle on
// every render within the same visit).
const HERO_VISIT_COUNT_KEY = 'yeoyo-accueil-hero-visit-count';
const HERO_VARIANT_COUNT = 3;

function isBannerSnoozed(key: string): boolean {
  const dismissedAt = Number(localStorage.getItem(key) ?? 0);
  return Date.now() - dismissedAt < BANNER_SNOOZE_MS;
}

function snoozeBanner(key: string): void {
  localStorage.setItem(key, String(Date.now()));
}

function matchNote(me: MyProfile, p: ProfileCard): string | undefined {
  const reasons: string[] = [];
  if (me.commune && p.commune === me.commune) reasons.push('Même commune');
  if (me.religion && p.religion === me.religion) reasons.push('Même religion');
  if (p.intent === me.intent) reasons.push('Même objectif');
  return reasons.length > 0 ? reasons.slice(0, 2).join(' · ') : undefined;
}

export default function DecouvrirPage() {
  const user = useUser();
  const { toast } = useToast();
  const {
    balance: creditBalance,
    unlimited: creditsUnlimited,
    refresh: refreshCredits,
  } = useCredits();
  const badgeCounts = useNavCounts();

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [recommended, setRecommended] = useState<ProfileCard[]>([]);
  const [held, setHeld] = useState<{ reason: string | null } | null>(null);
  const [likes, setLikes] = useState<LikeRow[]>([]);
  const [visitorsCount, setVisitorsCount] = useState(0);
  const [favoritedBy, setFavoritedBy] = useState<FavoritedBy>({
    preview: [],
    total: 0,
    unrevealedCount: 0,
  });
  const [newNearby, setNewNearby] = useState<NewNearbyCount | null>(null);
  const [heroVariant, setHeroVariant] = useState(0);
  const [boost, setBoost] = useState<BoostStatus | null>(null);
  const [boosting, setBoosting] = useState(false);
  const [showBoostConfirm, setShowBoostConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [favoritingUserId, setFavoritingUserId] = useState<string | null>(null);
  const [completionBannerDismissed, setCompletionBannerDismissed] = useState(false);
  const [premiumBannerDismissed, setPremiumBannerDismissed] = useState(false);
  const [boostBannerDismissed, setBoostBannerDismissed] = useState(false);
  const premiumBannerExit = useCardExit();
  const boostBannerExit = useCardExit();
  const { state: pushState, enable: enablePush } = usePushNotifications();
  const { install: installPwa } = usePwaInstall();
  const [pushBannerDismissed, setPushBannerDismissed] = useState(false);
  const pushBannerExit = useCardExit();
  // First-visit guided tour — shown once (localStorage flag). Waits for the
  // page to settle (not loading, profile complete) so the nav buttons it
  // spotlights are actually on screen.
  const [showTour, setShowTour] = useState(false);
  useEffect(() => {
    if (loading || needsOnboarding) return;
    if (!hasSeenTour()) setShowTour(true);
  }, [loading, needsOnboarding]);
  const closeTour = useCallback(() => {
    setShowTour(false);
    markTourSeen();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profileRes = await api<{ profile: MyProfile }>('/api/profile');
      setProfile(profileRes.profile);
      const [recRes, likesRes, visitorsRes, favoritedByRes, boostRes, newNearbyRes] =
        await Promise.all([
          api<{ profiles: ProfileCard[]; held?: boolean; heldReason?: string | null }>(
            '/api/profiles/explorer?page=1&pageSize=6',
          ),
          api<{ likes: LikeRow[] }>('/api/likes/received'),
          api<{ total: number }>('/api/profile/visitors'),
          api<FavoritedBy>('/api/profile/favorited-by'),
          api<BoostStatus>('/api/profile/boost'),
          api<NewNearbyCount>('/api/profile/new-nearby-count'),
        ]);
      setRecommended(recRes.profiles);
      setHeld(recRes.held ? { reason: recRes.heldReason ?? null } : null);
      setLikes(likesRes.likes);
      setVisitorsCount(visitorsRes.total);
      setFavoritedBy(favoritedByRes);
      setBoost(boostRes);
      setNewNearby(newNearbyRes);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PROFILE_NOT_FOUND') {
        setNeedsOnboarding(true);
      } else {
        toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  // Server is the single source of truth for revealed/unrevealedCount
  // (see WhoLikedBanner's header comment) — a lighter re-fetch than
  // `load()` after a successful credit spend, so the rest of the page
  // (recommended grid, profile completeness, etc.) doesn't flash reload.
  const refetchFavoritedBy = useCallback(async () => {
    try {
      setFavoritedBy(await api<FavoritedBy>('/api/profile/favorited-by'));
    } catch {
      /* non-critical widget refresh */
    }
  }, []);

  useEffect(() => {
    setCompletionBannerDismissed(isBannerSnoozed(COMPLETION_BANNER_DISMISS_KEY));
    setPremiumBannerDismissed(isBannerSnoozed(PREMIUM_BANNER_DISMISS_KEY));
    setBoostBannerDismissed(isBannerSnoozed(BOOST_BANNER_DISMISS_KEY));
    setPushBannerDismissed(isBannerSnoozed(PUSH_BANNER_DISMISS_KEY));

    const visitCount = Number(localStorage.getItem(HERO_VISIT_COUNT_KEY) ?? 0);
    localStorage.setItem(HERO_VISIT_COUNT_KEY, String(visitCount + 1));
    setHeroVariant(visitCount % HERO_VARIANT_COUNT);
  }, []);

  function dismissCompletionBanner() {
    snoozeBanner(COMPLETION_BANNER_DISMISS_KEY);
    setCompletionBannerDismissed(true);
  }

  function dismissPremiumBanner() {
    snoozeBanner(PREMIUM_BANNER_DISMISS_KEY);
    setPremiumBannerDismissed(true);
  }

  function dismissBoostBanner() {
    snoozeBanner(BOOST_BANNER_DISMISS_KEY);
    setBoostBannerDismissed(true);
  }

  function dismissPushBanner() {
    snoozeBanner(PUSH_BANNER_DISMISS_KEY);
    setPushBannerDismissed(true);
  }

  // 2026-08-27 (explicit user ask): the card action here is a *favorite*
  // bookmark toggle, not a contact request. Contact requests are made from
  // the full profile page or from Explorer — Découvrir is for browsing and
  // shortlisting only. A favorited card stays in the list (unlike the old
  // "send request → card leaves" behaviour). Mirrors Explorer's onFavorite.
  async function onFavorite(targetUserId: string) {
    setFavoritingUserId(targetUserId);
    const alreadyFavorited = recommended.find((p) => p.userId === targetUserId)?.favorited ?? false;
    try {
      if (alreadyFavorited) {
        await api('/api/favorites', { method: 'DELETE', body: { targetUserId } });
        toast('Retiré des favoris', 'success');
      } else {
        await api('/api/favorites', { method: 'POST', body: { targetUserId } });
        toast('Ajouté aux favoris', 'success');
      }
      setRecommended((prev) =>
        prev.map((p) => (p.userId === targetUserId ? { ...p, favorited: !alreadyFavorited } : p)),
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setFavoritingUserId(null);
    }
  }

  async function activateBoost() {
    if (boosting) return;
    setBoosting(true);
    try {
      await api('/api/profile/boost', { method: 'POST' });
      toast('Ton profil est boosté pour 24h !', 'success');
      setBoost((b) => (b ? { ...b, active: true } : b));
      setShowBoostConfirm(false);
      void refreshCredits();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_CREDITS') {
        toast('Solde de crédits insuffisant pour booster ton profil.', 'error');
      } else {
        toast('Impossible de lancer le boost pour le moment.', 'error');
      }
    } finally {
      setBoosting(false);
    }
  }

  // Always open the explainer dialog first — even for unlimited-access
  // users — so everyone sees what a boost does and confirms before it
  // activates (2026-08-27, explicit user ask).
  function requestBoost() {
    setShowBoostConfirm(true);
  }

  if (!user) return null;

  const quote = periodicPick(quotesForReligion(profile?.religion ?? null), QUOTE_ROTATION_HOURS);
  const tip = periodicPick(PROFILE_TIPS, QUOTE_ROTATION_HOURS);
  const pct = profile ? completeness(profile) : 0;

  return (
    <AppShell
      active="accueil"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <div className="px-5 py-5 lg:px-8 lg:py-6">
        {loading && (
          <div className="animate-fade-in mx-auto grid max-w-7xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <ProfileCardSkeleton count={4} />
          </div>
        )}

        {!loading && held && <HeldProfileBanner reason={held.reason} />}

        {!loading && needsOnboarding && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center">
            <p className="font-body text-sm text-muted-foreground">
              Complète ton profil pour accéder à ton tableau de bord.
            </p>
            <Link
              href="/onboarding"
              className="mt-4 inline-block rounded-xl bg-primary px-6 py-2.5 font-headings text-sm font-semibold text-primary-foreground"
            >
              Compléter mon profil
            </Link>
          </div>
        )}

        {!loading && profile && (
          <div className="flex flex-col gap-5 lg:mx-auto lg:max-w-7xl lg:flex-row lg:items-start lg:gap-6">
            {/* Sidebar (Banani: ProfileProgress/WhoLikedBanner/trust card/
                "Profil du jour", `w-72`) — stacks first on mobile, a real
                fixed-width column from `lg`. */}
            <aside className="flex flex-col gap-4 lg:w-72 lg:flex-shrink-0">
              {/* Greeting + completion — merges the old sticky "Bonjour" header
                and the separate completion card into one Banani-styled
                ProfileProgress card (dark secondary surface, "Mbote" —
                Lingala greeting — matching the mockup's own copy). */}
              <div className="animate-fade-in-down rounded-lg bg-secondary p-4 text-secondary-foreground">
                <div className="mb-3 flex items-center gap-3">
                  <UserAvatar
                    name={profile.firstName}
                    avatarUrl={profile.photoUrl}
                    size={40}
                    className="border-2 border-secondary-foreground/30"
                  />
                  <div>
                    <p className="font-body text-base font-bold">Mbote {profile.firstName} 👋</p>
                    {(profile.city || profile.commune) && (
                      <p className="font-body text-sm opacity-75">
                        {[profile.city, profile.commune].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                {pct < 100 && !completionBannerDismissed && (
                  <>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="font-body text-sm opacity-80">Profil complété</span>
                      <div className="flex items-center gap-2">
                        <span className="font-body text-lg font-bold">{pct}%</span>
                        <button
                          type="button"
                          onClick={dismissCompletionBanner}
                          aria-label="Fermer — me le rappeler plus tard"
                          className="flex h-5 w-5 items-center justify-center rounded-full text-secondary-foreground/60 hover:bg-secondary-foreground/10 hover:text-secondary-foreground"
                        >
                          <Icon name="x" size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="mb-3 h-2 w-full rounded-full bg-secondary-foreground/20">
                      <div
                        className="h-full rounded-full bg-secondary-foreground transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <Link
                      href="/app/profil"
                      className="font-body text-sm font-medium underline opacity-80"
                    >
                      Cliquer pour compléter
                    </Link>
                  </>
                )}
              </div>

              {!creditsUnlimited && !premiumBannerDismissed && (
                <div className={`animate-fade-in-up relative ${premiumBannerExit.exitClassName}`}>
                  <Link
                    href="/app/credits"
                    className="btn-premium flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 pr-10"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-background/40">
                        <Icon name="gem" size={18} />
                      </div>
                      <div>
                        <p className="font-headings text-sm font-semibold">
                          {creditBalance} crédit{creditBalance > 1 ? 's' : ''}
                        </p>
                        <p className="font-body text-xs opacity-80">
                          Achète des crédits pour voir qui t&apos;a mis en favori, qui a visité ton
                          profil, ou booster ta visibilité
                        </p>
                      </div>
                    </div>
                    <Icon name="chevron-right" size={18} className="flex-shrink-0 opacity-70" />
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      premiumBannerExit.trigger('left', dismissPremiumBanner);
                    }}
                    aria-label="Fermer — me le rappeler plus tard"
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              )}

              {/* Boost card — same /api/profile/boost status TopNav's own
                Boost button reads. Hidden once boosted (TopNav's pill
                already communicates the active state everywhere). */}
              {boost && !boost.active && !boostBannerDismissed && (
                <div className={`animate-fade-in-up relative ${boostBannerExit.exitClassName}`}>
                  <button
                    type="button"
                    onClick={requestBoost}
                    disabled={boosting}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-4 pr-10 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
                        <Icon name="zap" size={18} />
                      </div>
                      <div>
                        <p className="font-headings text-sm font-semibold text-foreground">
                          Booste ton profil
                        </p>
                        <p className="font-body text-xs text-muted-foreground">
                          Sois plus visible pendant 24h — {boost.cost} crédit
                          {boost.cost > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <span className="flex-shrink-0 font-body text-xs font-semibold text-primary">
                      {boosting ? '…' : 'Booster'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => boostBannerExit.trigger('left', dismissBoostBanner)}
                    aria-label="Fermer — me le rappeler plus tard"
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              )}

              {!pushBannerDismissed &&
                (pushState === 'default' || pushState === 'ios-needs-install') && (
                  <div className={`animate-fade-in-up relative ${pushBannerExit.exitClassName}`}>
                    <div className="flex w-full items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 pr-10">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Icon name="bell" size={18} />
                      </div>
                      <div>
                        <p className="font-headings text-sm font-semibold text-foreground">
                          Active les notifications
                        </p>
                        {pushState === 'ios-needs-install' ? (
                          <>
                            <p className="font-body text-xs text-muted-foreground">
                              Installe d’abord YeOyo sur ton écran d’accueil pour recevoir les
                              alertes.
                            </p>
                            <button
                              type="button"
                              onClick={() => void installPwa()}
                              className="mt-2 rounded-lg bg-primary px-3 py-1.5 font-body text-xs font-semibold text-primary-foreground"
                            >
                              Installer YeOyo
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="font-body text-xs text-muted-foreground">
                              Sois prévenu·e dès qu’on t’écrit ou qu’on accepte ton match.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                void enablePush().catch(() =>
                                  toast(
                                    'Impossible d’activer les notifications. Réessaie.',
                                    'error',
                                  ),
                                );
                              }}
                              className="mt-2 rounded-lg bg-primary px-3 py-1.5 font-body text-xs font-semibold text-primary-foreground"
                            >
                              Activer
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => pushBannerExit.trigger('left', dismissPushBanner)}
                      aria-label="Fermer — me le rappeler plus tard"
                      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                )}

              {/* Rotating hero slot — alternates across visits (not every
                  render) between trust badges, a bigger "coup de cœur du
                  jour" spotlight, and a live nearby-activity stat, so the
                  same corner of Accueil doesn't look frozen visit after
                  visit. See HERO_VISIT_COUNT_KEY above. */}
              <div key={heroVariant} className="animate-fade-in">
                {heroVariant === 1 && recommended[0] ? (
                  <div className="overflow-hidden rounded-lg border border-border bg-surface">
                    <ProfilePhotoCover
                      photoUrl={recommended[0].photoUrl}
                      name={recommended[0].firstName}
                      heightPx={140}
                    />
                    <div className="p-4">
                      <p className="mb-1 font-body text-xs font-bold uppercase tracking-wide text-primary">
                        ✨ Coup de cœur du jour
                      </p>
                      <p className="font-headings text-base font-bold text-foreground">
                        {recommended[0].firstName}, {recommended[0].age}
                      </p>
                      {(recommended[0].commune || recommended[0].job) && (
                        <p className="mt-0.5 font-body text-xs text-muted-foreground">
                          {[recommended[0].commune, recommended[0].job].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <Link
                        href={`/app/profils/${recommended[0].userId}`}
                        className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-2 font-body text-sm font-semibold text-primary-foreground"
                      >
                        Découvrir son profil
                      </Link>
                    </div>
                  </div>
                ) : heroVariant === 2 && newNearby ? (
                  <div className="rounded-lg border border-border bg-surface p-4">
                    <div className="mb-2 flex items-center gap-1.5 text-primary">
                      <Icon name="trending-up" size={14} />
                      <span className="font-headings text-xs font-semibold uppercase tracking-widest">
                        Ça bouge près de toi
                      </span>
                    </div>
                    <p className="font-headings text-2xl font-bold text-foreground">
                      {newNearby.count}
                    </p>
                    <p className="font-body text-xs text-muted-foreground">
                      nouveau{newNearby.count > 1 ? 'x' : ''} profil{newNearby.count > 1 ? 's' : ''}{' '}
                      cette semaine{' '}
                      {newNearby.scope === 'commune' ? `à ${newNearby.commune}` : 'à Kinshasa'}
                    </p>
                  </div>
                ) : (
                  // Default (variant 0, and the fallback when variant 1/2's
                  // data isn't available yet) — static value props.
                  <div className="rounded-lg border border-border bg-surface p-4">
                    <p className="mb-3 font-body text-sm font-bold text-foreground">
                      Pourquoi faire confiance à YeOyo ?
                    </p>
                    <div className="flex flex-col gap-3">
                      {TRUST_ITEMS.map((item) => (
                        <div key={item.title} className="flex items-start gap-2">
                          <div
                            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${item.tint}`}
                          >
                            <Icon name={item.icon} size={14} />
                          </div>
                          <div>
                            <p className="font-body text-xs font-bold text-foreground">
                              {item.title}
                            </p>
                            <p className="font-body text-xs text-muted-foreground">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <WhoLikedBanner
                preview={favoritedBy.preview}
                total={favoritedBy.total}
                unrevealedCount={favoritedBy.unrevealedCount}
                onUnlocked={() => void refetchFavoritedBy()}
              />

              {/* "Profil du jour" — Banani's sidebar single-profile card,
                reuses recommended[0] (already-fetched real data, same list
                the main grid shows — Banani's own mock doesn't dedupe
                between the two either). */}
              {recommended[0] && (
                <div className="rounded-lg border border-border bg-surface p-4">
                  <p className="mb-2 font-body text-xs font-bold uppercase tracking-wide text-accent-foreground">
                    Profil du jour
                  </p>
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={recommended[0].firstName}
                      avatarUrl={recommended[0].photoUrl}
                      size={48}
                      className="rounded-lg"
                    />
                    <div>
                      <p className="font-body text-sm font-bold text-foreground">
                        {recommended[0].firstName}, {recommended[0].age}
                      </p>
                      <p className="font-body text-xs text-muted-foreground">
                        {[recommended[0].commune, recommended[0].job].filter(Boolean).join(' · ')}
                      </p>
                      {recommended[0].verified && (
                        <div className="mt-1 flex items-center gap-1">
                          <Icon name="shield-check" size={10} className="text-secondary" />
                          <span className="font-body text-xs font-medium text-secondary">
                            Vérifié(e)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/app/profils/${recommended[0].userId}`}
                    className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-primary py-1.5 font-body text-sm font-medium text-primary"
                  >
                    Voir son profil
                  </Link>
                </div>
              )}
            </aside>

            <main className="flex flex-1 flex-col gap-5">
              {recommended.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      {/* Gold accent bar — anchors the page's main heading
                          and echoes the "premium" gold used by Boost /
                          crédits (2026-08-27 polish pass). */}
                      <div className="flex items-center gap-2.5">
                        <span className="h-6 w-1 rounded-full bg-gradient-to-b from-[#e6ac44] to-[#a9761d]" />
                        <h1 className="font-headings text-2xl font-bold text-foreground">
                          La sélection YeOyo
                        </h1>
                      </div>
                      <p className="mt-0.5 font-body text-sm text-muted-foreground">
                        Des profils sérieux choisis pour toi
                      </p>
                    </div>
                    <Link
                      href="/app/explorer"
                      className="flex flex-shrink-0 items-center gap-1.5 font-body text-sm font-medium text-secondary hover:underline"
                    >
                      Voir tous les profils
                      <Icon name="arrow-right" size={15} />
                    </Link>
                  </div>
                  <div
                    className={`grid gap-4 ${
                      recommended.length === 1
                        ? 'grid-cols-1'
                        : recommended.length === 2
                          ? 'grid-cols-2'
                          : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                    }`}
                  >
                    {recommended.map((p, i) => (
                      <div
                        key={p.userId}
                        className="animate-fade-in-up"
                        style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                      >
                        <RecommendedProfileCard
                          profile={p}
                          onFavorite={onFavorite}
                          favoriteBusy={favoritingUserId === p.userId}
                          note={matchNote(profile, p)}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Contact requests don't happen on Découvrir anymore — the
                      cards only bookmark. This CTA routes the user to
                      Explorer, where the swipe deck / "Demander" action
                      lives (2026-08-27, explicit user ask). */}
                  <Link
                    href="/app/explorer"
                    className="group mt-4 flex items-center justify-between gap-3 rounded-xl bg-primary px-5 py-4 text-primary-foreground shadow-md shadow-primary/30 transition-transform active:scale-95"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
                        <Icon name="sparkles" size={18} />
                      </span>
                      <div>
                        <p className="font-headings text-sm font-semibold">
                          Prêt·e à faire le premier pas ?
                        </p>
                        <p className="font-body text-xs text-primary-foreground/80">
                          Explore tous les profils et envoie tes demandes de contact
                        </p>
                      </div>
                    </div>
                    <Icon
                      name="arrow-right"
                      size={18}
                      className="flex-shrink-0 transition-transform group-hover:translate-x-0.5"
                    />
                  </Link>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border bg-surface p-5">
                  <div className="mb-2 flex items-center gap-1.5 text-primary">
                    <Icon name="book-open" size={14} />
                    <span className="font-headings text-xs font-semibold uppercase tracking-widest">
                      Pensée du jour
                    </span>
                  </div>
                  <p className="font-body text-sm italic text-foreground">
                    &ldquo;{quote.text}&rdquo;
                  </p>
                  <p className="mt-2 font-body text-xs text-muted-foreground">{quote.reference}</p>
                </div>
                <div className="rounded-xl border border-border bg-surface p-5">
                  <div className="mb-2 flex items-center gap-1.5 text-primary">
                    <Icon name="lightbulb" size={14} />
                    <span className="font-headings text-xs font-semibold uppercase tracking-widest">
                      Conseil du jour
                    </span>
                  </div>
                  <p className="font-body text-sm text-foreground">{tip}</p>
                </div>
              </div>

              {/* Quick-stat tiles — one loop instead of 4 near-identical
                  blocks (2026-08-27 polish pass), with a lift-on-hover so
                  they read as tappable. */}
              <div className="grid grid-cols-4 gap-3">
                {(
                  [
                    {
                      href: '/app/demandes',
                      icon: 'inbox',
                      value: badgeCounts.demandes ?? 0,
                      label: 'Demandes',
                    },
                    {
                      href: '/app/messages',
                      icon: 'message-circle',
                      value: badgeCounts.messages ?? 0,
                      label: 'Messages',
                    },
                    { href: '/app/likes', icon: 'heart', value: likes.length, label: "Qui m'aime" },
                    {
                      href: '/app/visiteurs',
                      icon: 'eye',
                      value: visitorsCount,
                      label: 'Visiteurs',
                    },
                  ] as const
                ).map((stat) => (
                  <Link
                    key={stat.href}
                    href={stat.href}
                    className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface p-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  >
                    <Icon name={stat.icon} size={18} className="text-primary" />
                    <span className="font-headings text-lg font-bold text-foreground">
                      {stat.value}
                    </span>
                    <span className="font-body text-xs text-muted-foreground">{stat.label}</span>
                  </Link>
                ))}
              </div>

              {likes.length > 0 && (
                <Link
                  href="/app/likes"
                  className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {likes.slice(0, 3).map((l) => (
                        <UserAvatar
                          key={l.likeId}
                          name={l.profile.firstName}
                          avatarUrl={l.profile.photoUrl}
                          size={32}
                          className="border-2 border-surface"
                        />
                      ))}
                    </div>
                    <div>
                      <p className="font-body text-sm font-medium text-foreground">
                        {likes.length} {likes.length > 1 ? 'personnes ont aimé' : 'personne a aimé'}{' '}
                        ton profil
                      </p>
                      <p className="font-body text-xs text-primary">Voir qui</p>
                    </div>
                  </div>
                  <Icon
                    name="chevron-right"
                    size={18}
                    className="flex-shrink-0 text-muted-foreground"
                  />
                </Link>
              )}

              <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${profile.visibilityPublic ? 'bg-verified' : 'bg-muted-foreground'}`}
                  />
                  <span className="font-body text-sm text-foreground">
                    {profile.visibilityPublic ? 'Profil actif' : 'Profil en pause'}
                  </span>
                  {profile.verifiedAt && (
                    <span className="flex items-center gap-1 rounded-md bg-verified/10 px-2 py-0.5 font-body text-xs text-verified">
                      <Icon name="shield-check" size={11} />
                      Vérifié
                    </span>
                  )}
                </div>
                <Link
                  href="/app/profil"
                  className="flex-shrink-0 font-body text-xs font-medium text-primary"
                >
                  Gérer
                </Link>
              </div>
            </main>
          </div>
        )}
      </div>

      <BoostConfirmModal
        open={showBoostConfirm}
        onClose={() => setShowBoostConfirm(false)}
        cost={boost?.cost ?? 3}
        balance={creditBalance}
        unlimited={creditsUnlimited}
        onConfirm={activateBoost}
        confirming={boosting}
      />

      {showTour && <GuidedTour steps={TOUR_STEPS} onClose={closeTour} />}
    </AppShell>
  );
}
