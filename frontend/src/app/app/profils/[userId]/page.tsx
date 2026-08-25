// Profile detail — "je veux qu'on puisse cliquer sur un profil et voir ses
// images/infos" (2026-08-10, user-driven). Reachable by tapping a card on
// Découvrir/Explorer (SwipeCard, ProfileGridCard, RecommendedProfileCard
// all link here). Reuses ProfileInfoSections (extracted from SwipeCard) so
// the bio/qualités/défauts/limites sections render identically to the
// swipe deck.
//
// Rebuilt 2026-08-14 (explicit user ask: "un bouton pour demander ou
// ajouter, l'autre pour envoyer le message, et tous les autres boutons
// nécessaires — bien organisé, bien redirigés") — inspired by /app/profil's
// (Mon Profil) richer, better-organized layout: a main column (photo +
// full info sections, now including Religion/Statut marital which this
// page never surfaced before) beside a sidebar (verification card +
// Signaler/Bloquer, moved out of the main flow but still de-emphasized —
// keeps the original "not competing with the primary actions" intent while
// giving desktop a real second column instead of one narrow stacked card).
// Two real actions, each backed by an existing endpoint, none invented:
//   - "Demander" (heart) — POST /api/likes. Per that route's own header
//     comment, liking auto-creates a PENDING ContactRequest AND upserts a
//     Conversation in the same transaction, so this is the literal
//     "demander à se connecter" action.
//   - "Favori" (star) — NEW on this page, POST/DELETE /api/favorites. This
//     project already ships this exact bookmark pattern on Explorer's grid
//     card (ProfileGridCard's star button); this page was the one place a
//     user could view a profile but had no way to bookmark it — the GET
//     /api/profiles/[userId] route now also returns `favorited` (mirroring
//     the existing `liked` sibling field) so this button can render its
//     initial state correctly.
// Signaler/Bloquer kept small and separate from the primary actions.
//
// 2026-08-25: the direct "Message" shortcut (send a message before the
// contact request is accepted) was removed — messaging now only opens once
// "Demander" is accepted, and the first message costs a credit for men (see
// lib/server/credits/ledger.ts). The public Premium badge is also gone —
// credit balance is private, not a status shown on other members' profiles.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { AppShell } from '@/components/yeoyo/AppShell';
import { PhotoCarousel } from '@/components/yeoyo/PhotoCarousel';
import { PhotoLightbox } from '@/components/yeoyo/PhotoLightbox';
import { ProfileInfoSections } from '@/components/yeoyo/ProfileInfoSections';
import { REPORT_REASONS } from '@/lib/yeoyo/constants';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import type { ProfileCard } from '@/lib/yeoyo/types';
import { useLikePop } from '@/lib/yeoyo/useLikePop';

export default function ProfileDetailPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const badgeCounts = useNavCounts();
  const params = useParams<{ userId: string }>();

  const [profile, setProfile] = useState<ProfileCard | null>(null);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const popping = useLikePop(liked);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number]['value'] | null>(
    null,
  );
  const [confirmingBlock, setConfirmingBlock] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const res = await api<{ profile: ProfileCard; liked: boolean; favorited: boolean }>(
        `/api/profiles/${params.userId}`,
      );
      setProfile(res.profile);
      setLiked(res.liked);
      setFavorited(res.favorited);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [params.userId, toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function onLike() {
    if (!profile) return;
    setBusy(true);
    try {
      await api('/api/likes', { method: 'POST', body: { targetUserId: profile.userId } });
      setLiked(true);
      toast('Demande envoyée — une demande de contact a été envoyée', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onToggleFavorite() {
    if (!profile || favoriteBusy) return;
    setFavoriteBusy(true);
    const next = !favorited;
    try {
      if (next) {
        await api('/api/favorites', { method: 'POST', body: { targetUserId: profile.userId } });
        toast('Ajouté à tes favoris', 'success');
      } else {
        await api('/api/favorites', { method: 'DELETE', body: { targetUserId: profile.userId } });
        toast('Retiré de tes favoris', 'success');
      }
      setFavorited(next);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function blockUser() {
    if (!profile) return;
    try {
      await api(`/api/users/${profile.userId}/block`, { method: 'POST' });
      toast('Utilisateur bloqué', 'success');
      router.push('/app/explorer');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  async function submitReport() {
    if (!profile || !reportReason) return;
    try {
      await api('/api/reports', {
        method: 'POST',
        body: { targetUserId: profile.userId, reason: reportReason },
      });
      toast('Signalement envoyé — notre équipe va l’examiner', 'success');
      setReportReason(null);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    }
  }

  if (!user) return null;

  return (
    <AppShell
      active="decouvrir"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <div className="flex items-center gap-3 border-b border-border px-5 py-4 lg:px-8">
        <button type="button" onClick={() => router.back()} aria-label="Retour">
          <Icon name="chevron-left" size={22} />
        </button>
        <h1 className="font-headings text-lg font-bold text-foreground">Profil</h1>
      </div>

      <div className="px-5 py-5 lg:mx-auto lg:max-w-5xl lg:px-8">
        {loading && (
          <p className="text-center font-body text-sm text-muted-foreground">Chargement…</p>
        )}

        {!loading && notFound && (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-2 rounded-xl border border-border bg-surface p-10 text-center">
            <Icon name="user" size={28} className="text-muted-foreground" />
            <p className="font-headings text-base font-semibold text-foreground">
              Profil introuvable
            </p>
            <Link
              href="/app/explorer"
              className="mt-3 rounded-xl bg-primary px-6 py-2.5 font-headings text-sm font-semibold text-primary-foreground"
            >
              Retour à Explorer
            </Link>
          </div>
        )}

        {!loading && profile && (
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
            {/* Main column — photo + full info sections. */}
            <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface lg:flex-1">
              {/* Tapping the photo opens it full-size (2026-08-14, explicit
                  user ask — this is the page where photo enlargement
                  belongs, not the Explorer/Découvrir swipe card, where it
                  conflicted with the favorite star button and the
                  multi-photo carousel's own tap zones). Those zones
                  stopPropagate their own click so paging through photos
                  here doesn't also pop the lightbox. */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Voir la photo en grand"
                onClick={() => setLightboxOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setLightboxOpen(true);
                  }
                }}
                className="relative cursor-pointer"
              >
                <PhotoCarousel
                  photoUrls={profile.photoUrls}
                  name={profile.firstName}
                  heightPx={420}
                  onIndexChange={setActivePhotoIndex}
                />
                {profile.verified && (
                  <div
                    className={`absolute left-3 flex flex-col items-start gap-1.5 ${profile.photoUrls.length > 1 ? 'top-6' : 'top-3'}`}
                  >
                    <div className="flex items-center gap-1.5 rounded-lg bg-background/90 px-2.5 py-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-verified" />
                      <span className="font-body text-xs font-medium text-foreground">
                        Vérifié IA
                      </span>
                    </div>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-3 pt-14">
                  <div className="flex items-baseline gap-2">
                    <span className="font-headings text-xl font-bold text-white">
                      {profile.firstName}
                    </span>
                    <span className="font-body text-base text-white/80">{profile.age} ans</span>
                  </div>
                  {(profile.city || profile.commune) && (
                    <div className="mt-1 flex items-center gap-1 text-white/80">
                      <Icon name="map-pin" size={13} />
                      <span className="font-body text-sm">
                        {[profile.city, profile.commune].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                  {profile.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {profile.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-white/15 px-2 py-1 font-body text-xs text-white"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-5 p-4 lg:p-6">
                {/* Primary actions — Favori (bookmark, no side effect) and
                    Demander (send a contact request; messaging opens once
                    it's accepted, see the conversation thread's own
                    first_message credit gate). */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void onToggleFavorite()}
                    disabled={favoriteBusy}
                    aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                    className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border ${favoriteBusy ? 'opacity-50' : ''} ${favorited ? 'border-gold bg-gold/10 text-gold' : 'border-border bg-background text-muted-foreground'}`}
                  >
                    {favoriteBusy ? (
                      <Icon name="refresh-cw" size={17} className="animate-spin" />
                    ) : (
                      <Icon name="star" size={18} fill={favorited ? 'currentColor' : 'none'} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onLike()}
                    disabled={busy || liked}
                    className={`btn-success-flash flex h-12 flex-1 items-center justify-center gap-2 rounded-full px-5 ${busy ? 'opacity-50' : ''} ${liked ? 'bg-secondary/70 text-secondary-foreground' : 'bg-secondary text-secondary-foreground'}`}
                  >
                    {busy ? (
                      <Icon name="refresh-cw" size={17} className="animate-spin" />
                    ) : (
                      <Icon
                        name="heart"
                        size={17}
                        fill={liked ? 'currentColor' : 'none'}
                        className={popping ? 'animate-heart-pop' : ''}
                      />
                    )}
                    <span className="font-body text-sm font-semibold">
                      {liked ? 'Envoyée' : 'Demander'}
                    </span>
                  </button>
                </div>

                <ProfileInfoSections profile={profile} />
              </div>
            </div>

            {/* Sidebar — verification context + Signaler/Bloquer, kept
                small and separate from the three primary actions above. */}
            <aside className="flex flex-col gap-4 lg:w-72 lg:flex-shrink-0">
              {profile.verified && (
                <div className="flex items-start gap-3 rounded-xl border border-verified/30 bg-verified/5 p-4">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-verified/10 text-verified">
                    <Icon name="shield-check" size={16} />
                  </div>
                  <div>
                    <p className="font-body text-sm font-semibold text-foreground">
                      Profil vérifié
                    </p>
                    <p className="font-body text-xs text-muted-foreground">
                      L&rsquo;identité de {profile.firstName} a été contrôlée par notre équipe.
                    </p>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="mb-3 font-body text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Un problème avec ce profil ?
                </p>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setReportReason(reportReason === null ? 'OTHER' : null)}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 text-left font-body text-sm text-muted-foreground hover:bg-background"
                  >
                    <Icon name="info" size={15} />
                    Signaler ce profil
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingBlock(true)}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 text-left font-body text-sm text-red-500 hover:bg-red-500/5"
                  >
                    <Icon name="ban" size={15} />
                    Bloquer {profile.firstName}
                  </button>
                </div>

                {reportReason !== null && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-3">
                    <select
                      value={reportReason}
                      onChange={(e) =>
                        setReportReason(e.target.value as (typeof REPORT_REASONS)[number]['value'])
                      }
                      className="rounded-lg border border-border bg-surface px-2 py-1.5 font-body text-xs text-foreground"
                    >
                      {REPORT_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void submitReport()}
                      className="rounded-lg bg-primary px-3 py-1.5 font-body text-xs font-semibold text-primary-foreground"
                    >
                      Envoyer
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportReason(null)}
                      className="font-body text-xs text-muted-foreground"
                    >
                      Annuler
                    </button>
                  </div>
                )}

                {confirmingBlock && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
                    <p className="font-body text-xs text-muted-foreground">
                      Bloquer {profile.firstName} ? Vous ne pourrez plus vous voir ni vous
                      contacter.
                    </p>
                    <button
                      type="button"
                      onClick={() => void blockUser()}
                      className="rounded-lg bg-red-500 px-3 py-1.5 font-body text-xs font-semibold text-white"
                    >
                      Confirmer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingBlock(false)}
                      className="font-body text-xs text-muted-foreground"
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>

      {lightboxOpen && profile && (
        <PhotoLightbox
          photoUrl={profile.photoUrls[activePhotoIndex] ?? profile.photoUrls[0] ?? null}
          name={profile.firstName}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </AppShell>
  );
}
