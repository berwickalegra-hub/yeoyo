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
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { AppShell } from '@/components/yeoyo/AppShell';
import { RecommendedProfileCard } from '@/components/yeoyo/RecommendedProfileCard';
import { WhoLikedBanner } from '@/components/yeoyo/WhoLikedBanner';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { dailyPick, quotesForReligion, PROFILE_TIPS } from '@/lib/yeoyo/content';
import type { ProfileCard } from '@/lib/yeoyo/types';

interface MyProfile {
  firstName: string;
  city: string;
  commune: string | null;
  religion: string | null;
  intent: string;
  bio: string | null;
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

interface SubscriptionInfo {
  status: string;
}

interface BoostStatus {
  active: boolean;
  canBoost: boolean;
  isPremium: boolean;
  cooldownEndsAt: string | null;
}

interface FavoritedBy {
  preview: ProfileCard[];
  total: number;
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
    desc: 'Airtel Money · Orange Money · M-Pesa',
    // Banani uses text-accent here, but this project's accent token has no
    // usable foreground pair (see premium/page.tsx's bg-accent/10
    // text-primary icon tile for the same substitution).
    tint: 'bg-accent/10 text-primary',
  },
];

const COMPLETENESS_FIELDS = [
  'bio',
  'commune',
  'religion',
  'maritalStatus',
  'childrenCount',
  'wantsChildren',
  'relocateOpen',
] as const;

function completeness(p: MyProfile): number {
  const done = COMPLETENESS_FIELDS.filter((f) => !!p[f]).length;
  return Math.round((done / COMPLETENESS_FIELDS.length) * 100);
}

// Completion nudge is dismissible (explicit user ask, 2026-08-14 second
// pass: it should only live here on Accueil, not also on Mon Profil, and
// closing it should snooze it rather than removing it permanently — it
// comes back on the next visit after 24h if the profile is still
// incomplete). localStorage, not the DB: this is a per-device UI snooze,
// not account state worth a schema field.
const COMPLETION_BANNER_DISMISS_KEY = 'yeoyo-completion-banner-dismissed-at';
const COMPLETION_BANNER_SNOOZE_MS = 24 * 60 * 60 * 1000;

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
  const badgeCounts = useNavCounts();

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [recommended, setRecommended] = useState<ProfileCard[]>([]);
  const [likes, setLikes] = useState<LikeRow[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [visitorsCount, setVisitorsCount] = useState(0);
  const [favoritedBy, setFavoritedBy] = useState<FavoritedBy>({ preview: [], total: 0 });
  const [boost, setBoost] = useState<BoostStatus | null>(null);
  const [boosting, setBoosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [actingUserId, setActingUserId] = useState<string | null>(null);
  const [completionBannerDismissed, setCompletionBannerDismissed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profileRes = await api<{ profile: MyProfile }>('/api/profile');
      setProfile(profileRes.profile);
      const [recRes, likesRes, subRes, visitorsRes, favoritedByRes, boostRes] = await Promise.all([
        api<{ profiles: ProfileCard[] }>('/api/profiles/explorer?page=1&pageSize=6'),
        api<{ likes: LikeRow[] }>('/api/likes/received'),
        api<{ subscription: SubscriptionInfo | null }>('/api/subscriptions/me'),
        api<{ total: number }>('/api/profile/visitors'),
        api<FavoritedBy>('/api/profile/favorited-by'),
        api<BoostStatus>('/api/profile/boost'),
      ]);
      setRecommended(recRes.profiles);
      setLikes(likesRes.likes);
      setSubscription(subRes.subscription);
      setVisitorsCount(visitorsRes.total);
      setFavoritedBy(favoritedByRes);
      setBoost(boostRes);
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

  useEffect(() => {
    const dismissedAt = Number(localStorage.getItem(COMPLETION_BANNER_DISMISS_KEY) ?? 0);
    setCompletionBannerDismissed(Date.now() - dismissedAt < COMPLETION_BANNER_SNOOZE_MS);
  }, []);

  function dismissCompletionBanner() {
    localStorage.setItem(COMPLETION_BANNER_DISMISS_KEY, String(Date.now()));
    setCompletionBannerDismissed(true);
  }

  async function onLike(targetUserId: string) {
    setActingUserId(targetUserId);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      // Explorer/Découvrir only ever show profiles with no pending request
      // from me — toggling a like/dislike on a request already sent reads
      // as "can I take it back from here", which belongs on Demandes →
      // Envoyées instead. So a liked card leaves this list immediately
      // rather than sticking around in a "liked" visual state.
      setRecommended((prev) => prev.filter((p) => p.userId !== targetUserId));
      toast('Profil aimé — une demande de contact a été envoyée', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setActingUserId(null);
    }
  }

  async function activateBoost() {
    if (boosting) return;
    setBoosting(true);
    try {
      await api('/api/profile/boost', { method: 'POST' });
      toast('Ton profil est boosté pour 30 minutes !', 'success');
      setBoost((b) => (b ? { ...b, active: true } : b));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BOOST_COOLDOWN_ACTIVE') {
        toast('Ton prochain boost gratuit revient dans 24h — ou passe Premium.', 'error');
      } else {
        toast('Impossible de lancer le boost pour le moment.', 'error');
      }
    } finally {
      setBoosting(false);
    }
  }

  if (!user) return null;

  const quote = dailyPick(quotesForReligion(profile?.religion ?? null));
  const tip = dailyPick(PROFILE_TIPS);
  const pct = profile ? completeness(profile) : 0;

  return (
    <AppShell active="accueil" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <div className="px-5 py-5 lg:px-8 lg:py-6">
        {loading && (
          <p className="text-center font-body text-sm text-muted-foreground">Chargement…</p>
        )}

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

              {subscription?.status !== 'ACTIVE' && (
                <Link
                  href="/app/premium"
                  className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/15 to-primary/5 px-5 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                      <Icon name="crown" size={18} />
                    </div>
                    <div>
                      <p className="font-headings text-sm font-semibold text-foreground">
                        Passe Premium
                      </p>
                      <p className="font-body text-xs text-muted-foreground">
                        Demandes illimitées, profil mis en avant
                      </p>
                    </div>
                  </div>
                  <Icon
                    name="chevron-right"
                    size={18}
                    className="flex-shrink-0 text-muted-foreground"
                  />
                </Link>
              )}

              {/* Boost card — same /api/profile/boost status TopNav's own
                Boost button reads. Hidden once boosted (TopNav's pill
                already communicates the active state everywhere). */}
              {boost && !boost.active && (
                <button
                  type="button"
                  onClick={() => void activateBoost()}
                  disabled={boosting || !boost.canBoost}
                  className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-4 text-left ${
                    !boost.canBoost ? 'opacity-60' : ''
                  }`}
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
                        {boost.canBoost
                          ? 'Sois plus visible pendant 30 minutes'
                          : 'Ton prochain boost gratuit revient bientôt'}
                      </p>
                    </div>
                  </div>
                  {boost.canBoost && (
                    <span className="flex-shrink-0 font-body text-xs font-semibold text-primary">
                      {boosting ? '…' : 'Booster'}
                    </span>
                  )}
                </button>
              )}

              {/* Trust badges — static value props, Banani's own sidebar card. */}
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
                        <p className="font-body text-xs font-bold text-foreground">{item.title}</p>
                        <p className="font-body text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <WhoLikedBanner preview={favoritedBy.preview} total={favoritedBy.total} />

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
                      <h1 className="font-headings text-2xl font-bold text-foreground">
                        La sélection YeOyo
                      </h1>
                      <p className="mt-0.5 font-body text-sm text-muted-foreground">
                        Des profils sérieux choisis pour toi
                      </p>
                    </div>
                    <Link
                      href="/app/explorer"
                      className="flex flex-shrink-0 items-center gap-1.5 font-body text-sm font-medium text-secondary"
                    >
                      Voir tous les profils
                      <Icon name="arrow-right" size={15} />
                    </Link>
                  </div>
                  <div
                    className={`animate-fade-in grid gap-4 ${
                      recommended.length === 1
                        ? 'grid-cols-1'
                        : recommended.length === 2
                          ? 'grid-cols-2'
                          : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                    }`}
                  >
                    {recommended.map((p) => (
                      <RecommendedProfileCard
                        key={p.userId}
                        profile={p}
                        onLike={onLike}
                        liking={actingUserId === p.userId}
                        note={matchNote(profile, p)}
                      />
                    ))}
                  </div>
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

              <div className="grid grid-cols-4 gap-3">
                <Link
                  href="/app/demandes"
                  className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface p-4 text-center"
                >
                  <Icon name="inbox" size={18} className="text-primary" />
                  <span className="font-headings text-lg font-bold text-foreground">
                    {badgeCounts.demandes ?? 0}
                  </span>
                  <span className="font-body text-xs text-muted-foreground">Demandes</span>
                </Link>
                <Link
                  href="/app/messages"
                  className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface p-4 text-center"
                >
                  <Icon name="message-circle" size={18} className="text-primary" />
                  <span className="font-headings text-lg font-bold text-foreground">
                    {badgeCounts.messages ?? 0}
                  </span>
                  <span className="font-body text-xs text-muted-foreground">Messages</span>
                </Link>
                <Link
                  href="/app/likes"
                  className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface p-4 text-center"
                >
                  <Icon name="heart" size={18} className="text-primary" />
                  <span className="font-headings text-lg font-bold text-foreground">
                    {likes.length}
                  </span>
                  <span className="font-body text-xs text-muted-foreground">Qui m&rsquo;aime</span>
                </Link>
                <Link
                  href="/app/visiteurs"
                  className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface p-4 text-center"
                >
                  <Icon name="eye" size={18} className="text-primary" />
                  <span className="font-headings text-lg font-bold text-foreground">
                    {visitorsCount}
                  </span>
                  <span className="font-body text-xs text-muted-foreground">Visiteurs</span>
                </Link>
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
    </AppShell>
  );
}
