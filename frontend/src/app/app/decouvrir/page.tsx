// Découvrir — the app's landing tab, rebuilt 2026-08-10 as a scrollable
// home dashboard (product decision from chat, inspired by a competitor's
// "Accueil" screen: the landing tab should surface what concerns *you*
// personally — profile health, a few recommended profiles, real activity
// stats — while the swipe-to-decide UX moved to Explorer, see that page's
// header comment).
//
// Every widget here is backed by real, already-collected data — nothing
// is fabricated to look like Farata's screen:
//   - "Sélection pour toi" has NO invented match percentage (no scoring
//     algorithm exists) — instead it shows real, derived "why recommended"
//     tags (same commune / same religion / same objectif) computed by
//     comparing two real profiles.
//   - "Profil complété" only counts fields a user can actually go fix
//     afterwards (bio/religion/statut marital/enfants — all now editable
//     in Paramètres; commune too). Photo isn't counted: there is still no
//     post-onboarding photo-replace flow in this kit, so nudging toward an
//     unactionable field would be dishonest UI.
//   - "Pensée du jour" / "Conseil du jour" are curated, real content (see
//     lib/yeoyo/content.ts) — not generated, not a fabricated statistic.
//   - Stats (Demandes/Messages/Qui m'aime) reuse the same counts the
//     sidebar badges and /app/likes already compute — no view-tracking
//     ("Vues"/"Visiteurs") is shown since this kit has no such tracking.
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
}

interface LikeRow {
  likeId: string;
  profile: ProfileCard;
}

interface SubscriptionInfo {
  status: string;
}

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
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [actingUserId, setActingUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profileRes = await api<{ profile: MyProfile }>('/api/profile');
      setProfile(profileRes.profile);
      const [recRes, likesRes, subRes] = await Promise.all([
        api<{ profiles: ProfileCard[] }>('/api/profiles/explorer?page=1&pageSize=6'),
        api<{ likes: LikeRow[] }>('/api/likes/received'),
        api<{ subscription: SubscriptionInfo | null }>('/api/subscriptions/me'),
      ]);
      setRecommended(recRes.profiles);
      setLikes(likesRes.likes);
      setSubscription(subRes.subscription);
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

  async function onLike(targetUserId: string) {
    setActingUserId(targetUserId);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId } });
      setRecommended((prev) =>
        prev.map((p) => (p.userId === targetUserId ? { ...p, liked: true } : p)),
      );
      toast('Profil aimé — une demande de contact a été envoyée', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setActingUserId(null);
    }
  }

  if (!user) return null;

  const quote = dailyPick(quotesForReligion(profile?.religion ?? null));
  const tip = dailyPick(PROFILE_TIPS);
  const pct = profile ? completeness(profile) : 0;

  return (
    <AppShell active="decouvrir" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <div className="sticky top-0 z-20 animate-fade-in-down border-b border-border bg-background/95 px-5 py-5 shadow-sm backdrop-blur-sm lg:px-8">
        <h1 className="font-headings text-xl font-bold text-foreground">
          Bonjour{profile ? `, ${profile.firstName}` : ''} 👋
        </h1>
        {profile && (profile.city || profile.commune) && (
          <p className="mt-0.5 font-body text-sm text-muted-foreground">
            {[profile.city, profile.commune].filter(Boolean).join(', ')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-5 px-5 py-5 lg:mx-auto lg:w-full lg:max-w-3xl lg:px-8">
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
          <>
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

            {pct < 100 && (
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <p className="font-headings text-sm font-semibold text-foreground">
                    Profil complété
                  </p>
                  <span className="font-headings text-sm font-bold text-primary">{pct}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <Link
                  href="/app/parametres"
                  className="mt-3 inline-flex items-center gap-1 font-body text-xs font-medium text-primary"
                >
                  Compléter mon profil
                  <Icon name="chevron-right" size={12} />
                </Link>
              </div>
            )}

            {recommended.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-1.5">
                  <Icon name="sparkles" size={15} className="text-primary" />
                  <h2 className="font-headings text-sm font-semibold text-foreground">
                    Sélection pour toi
                  </h2>
                </div>
                <div className="animate-fade-in grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
                <Link
                  href="/app/explorer"
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2.5 font-body text-sm font-medium text-primary"
                >
                  Voir tous les profils
                  <Icon name="chevron-right" size={14} />
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

            <div className="grid grid-cols-3 gap-3">
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
                href="/app/parametres"
                className="flex-shrink-0 font-body text-xs font-medium text-primary"
              >
                Gérer
              </Link>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
