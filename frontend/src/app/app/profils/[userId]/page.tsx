// Profile detail — "je veux qu'on puisse cliquer sur un profil et voir ses
// images/infos" (2026-08-10, user-driven). Reachable by tapping a card on
// Découvrir/Explorer (SwipeCard, ProfileGridCard, RecommendedProfileCard
// all link here). Reuses ProfileInfoSections (extracted from SwipeCard) so
// the bio/qualités/défauts/limites sections render identically to the
// swipe deck. Bloquer/Signaler are deliberately tucked at the very bottom
// of the page, small and understated — not competing with Message/Aimer
// for attention, per explicit user ask.
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
  const popping = useLikePop(liked);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number]['value'] | null>(
    null,
  );
  const [confirmingBlock, setConfirmingBlock] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const res = await api<{ profile: ProfileCard; liked: boolean }>(
        `/api/profiles/${params.userId}`,
      );
      setProfile(res.profile);
      setLiked(res.liked);
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
      toast('Profil aimé — une demande de contact a été envoyée', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onMessage() {
    if (!profile) return;
    setBusy(true);
    try {
      const res = await api<{ conversationId: string }>('/api/likes', {
        method: 'POST',
        body: { targetUserId: profile.userId },
      });
      router.push(`/app/messages/${res.conversationId}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setBusy(false);
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
    <AppShell active="explorer" user={{ name: user.email }} badgeCounts={badgeCounts}>
      <div className="flex items-center gap-3 border-b border-border px-5 py-4 lg:px-8">
        <button type="button" onClick={() => router.back()} aria-label="Retour">
          <Icon name="chevron-left" size={22} />
        </button>
        <h1 className="font-headings text-lg font-bold text-foreground">Profil</h1>
      </div>

      <div className="px-5 py-5 lg:mx-auto lg:w-full lg:max-w-xl lg:px-8">
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
          <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="relative">
              <PhotoCarousel
                photoUrls={profile.photoUrls}
                name={profile.firstName}
                heightPx={380}
              />
              {profile.verified && (
                <div
                  className={`absolute left-3 flex items-center gap-1.5 rounded-lg bg-background/90 px-2.5 py-1 ${profile.photoUrls.length > 1 ? 'top-6' : 'top-3'}`}
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-verified" />
                  <span className="font-body text-xs font-medium text-foreground">Vérifié IA</span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-3 pt-14">
                <div className="flex items-baseline gap-2">
                  <span className="font-headings text-xl font-bold text-white">
                    {profile.firstName}
                  </span>
                  <span className="font-body text-base text-white/80">{profile.age} ans</span>
                </div>
                {profile.commune && (
                  <div className="mt-1 flex items-center gap-1 text-white/80">
                    <Icon name="map-pin" size={13} />
                    <span className="font-body text-sm">{profile.commune}</span>
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

            <div className="flex flex-col gap-4 p-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void onMessage()}
                  disabled={busy}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background text-foreground disabled:opacity-50"
                >
                  {busy ? (
                    <Icon name="refresh-cw" size={17} className="animate-spin" />
                  ) : (
                    <Icon name="message-circle" size={17} />
                  )}
                  <span className="font-body text-sm font-semibold">Message</span>
                </button>
                <button
                  type="button"
                  onClick={() => void onLike()}
                  disabled={busy || liked}
                  className={`btn-success-flash flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${liked ? 'bg-primary/20 text-primary' : 'bg-primary text-primary-foreground'}`}
                  aria-label={liked ? 'Déjà aimé' : 'Aimer ce profil'}
                >
                  {busy ? (
                    <Icon name="refresh-cw" size={20} className="animate-spin" />
                  ) : (
                    <Icon
                      name="heart"
                      size={20}
                      fill={liked ? 'currentColor' : 'none'}
                      className={popping ? 'animate-heart-pop' : ''}
                    />
                  )}
                </button>
              </div>

              <ProfileInfoSections profile={profile} />

              <div className="mt-4 flex items-center justify-center gap-5 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setReportReason(reportReason === null ? 'OTHER' : null)}
                  className="font-body text-xs text-muted-foreground"
                >
                  Signaler
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingBlock(true)}
                  className="font-body text-xs text-red-500"
                >
                  Bloquer
                </button>
              </div>

              {reportReason !== null && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-3">
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
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
                  <p className="font-body text-xs text-muted-foreground">
                    Bloquer {profile.firstName} ? Vous ne pourrez plus vous voir ni vous contacter.
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
          </div>
        )}
      </div>
    </AppShell>
  );
}
