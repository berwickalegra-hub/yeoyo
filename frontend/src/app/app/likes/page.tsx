// Mes likes — profiles that liked me (GET /api/likes/received). Liking one
// back reuses the existing POST /api/likes — same auto-ContactRequest
// behaviour as Découverte/Explorer, so accepting still happens via Demandes.
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { usePremium } from '@/contexts/PremiumContext';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { AppShell } from '@/components/yeoyo/AppShell';
import { MessageListSkeleton } from '@/components/yeoyo/MessageListSkeleton';
import { PremiumGateModal } from '@/components/yeoyo/PremiumGateModal';
import { useNavCounts } from '@/lib/yeoyo/useNavCounts';
import { INTENT_LABELS, type ProfileCard } from '@/lib/yeoyo/types';
import { useLikePop } from '@/lib/yeoyo/useLikePop';

interface LikeRow {
  likeId: string;
  createdAt: string;
  likedBack: boolean;
  profile: ProfileCard;
}

function LikeBackButton({
  liked,
  busy,
  onClick,
}: {
  liked: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const popping = useLikePop(liked);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={liked ? 'Retirer le like' : 'Aimer en retour'}
      className={`btn-success-flash btn-press flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 ${busy ? 'opacity-50' : ''} sm:px-4 ${liked ? 'bg-primary/20 text-primary' : 'bg-primary text-primary-foreground'}`}
    >
      {busy ? (
        <Icon name="refresh-cw" size={15} className="animate-spin" />
      ) : (
        <Icon
          name="heart"
          size={15}
          fill={liked ? 'currentColor' : 'none'}
          className={popping ? 'animate-heart-pop' : ''}
        />
      )}
      <span className="hidden font-body text-sm font-semibold sm:inline">
        {liked ? 'Aimé' : 'Aimer en retour'}
      </span>
    </button>
  );
}

export default function LikesPage() {
  const user = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const { isPremium, loading: premiumLoading } = usePremium();
  const badgeCounts = useNavCounts();
  const [likes, setLikes] = useState<LikeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const locked = !premiumLoading && !isPremium;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ likes: LikeRow[] }>('/api/likes/received');
      setLikes(res.likes);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function likeBack(userId: string, alreadyLiked: boolean) {
    setLikingId(userId);
    try {
      if (alreadyLiked) {
        await api('/api/likes', { method: 'DELETE', body: { targetUserId: userId } });
        setLikes((prev) =>
          prev.map((l) => (l.profile.userId === userId ? { ...l, likedBack: false } : l)),
        );
        toast('Like retiré', 'success');
        return;
      }
      const res = await api<{ conversationId: string }>('/api/likes', {
        method: 'POST',
        body: { targetUserId: userId },
      });
      setLikes((prev) =>
        prev.map((l) => (l.profile.userId === userId ? { ...l, likedBack: true } : l)),
      );
      toast('C’est un match — direction la conversation !', 'success');
      router.push(`/app/messages/${res.conversationId}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Une erreur est survenue', 'error');
    } finally {
      setLikingId(null);
    }
  }

  if (!user) return null;

  return (
    <AppShell
      active="likes"
      user={{ name: user.email, avatarUrl: user.avatarUrl }}
      badgeCounts={badgeCounts}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-5 lg:px-8">
        <div>
          <h1 className="font-headings text-xl font-bold text-foreground">Mes likes</h1>
          <p className="mt-0.5 font-body text-sm text-muted-foreground">
            Profils qui t’ont aimé(e)
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-5 py-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8">
        {loading && <MessageListSkeleton count={4} />}
        {!loading && likes.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-8 text-center">
            <Icon name="heart" size={28} className="text-muted-foreground" />
            <p className="font-body text-sm text-muted-foreground">
              Personne ne t’a encore aimé(e). Complète ton profil et explore pour te faire
              remarquer.
            </p>
          </div>
        )}
        {!loading && locked && likes.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-gold bg-gold/10 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gold/20">
                <Icon name="crown" size={18} className="text-gold" />
              </div>
              <div>
                <p className="font-body text-sm font-bold text-foreground">
                  {likes.length} {likes.length > 1 ? 'personnes ont aimé' : 'personne a aimé'} ton
                  profil
                </p>
                <p className="font-body text-xs text-muted-foreground">
                  Passe Premium pour voir qui
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPremiumModal(true)}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-gold px-4 py-2 font-body text-sm font-bold text-gold-foreground transition-transform active:scale-95"
            >
              <Icon name="crown" size={14} />
              Débloquer
            </button>
          </div>
        )}
        {likes.map((l, i) => (
          <div
            key={l.likeId}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 animate-fade-in-up"
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            {locked ? (
              <button
                type="button"
                onClick={() => setShowPremiumModal(true)}
                className="flex min-w-0 flex-1 items-center gap-4 text-left"
              >
                <div className="blur-sm select-none">
                  <UserAvatar name={l.profile.firstName} avatarUrl={l.profile.photoUrl} size={56} />
                </div>
                <div className="min-w-0 flex-1 select-none blur-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-headings text-base font-bold text-foreground">
                      {l.profile.firstName}
                    </span>
                    <span className="font-body text-sm text-muted-foreground">
                      {l.profile.age} ans
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                    <Icon name="gem" size={11} />
                    <span className="font-body text-xs">
                      {INTENT_LABELS[l.profile.intent] ?? l.profile.intent}
                    </span>
                  </div>
                </div>
              </button>
            ) : (
              <Link
                href={`/app/profils/${l.profile.userId}`}
                className="flex min-w-0 flex-1 items-center gap-4"
              >
                <UserAvatar name={l.profile.firstName} avatarUrl={l.profile.photoUrl} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-headings text-base font-bold text-foreground">
                      {l.profile.firstName}
                    </span>
                    <span className="font-body text-sm text-muted-foreground">
                      {l.profile.age} ans
                    </span>
                    {l.profile.verified && <div className="h-1.5 w-1.5 rounded-full bg-verified" />}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                    <Icon name="gem" size={11} />
                    <span className="font-body text-xs">
                      {INTENT_LABELS[l.profile.intent] ?? l.profile.intent}
                    </span>
                    {l.profile.commune && (
                      <>
                        <span className="text-border">•</span>
                        <Icon name="map-pin" size={11} />
                        <span className="font-body text-xs">{l.profile.commune}</span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            )}
            {locked ? (
              <button
                type="button"
                onClick={() => setShowPremiumModal(true)}
                className="flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gold px-2.5 text-gold-foreground transition-transform active:scale-95 sm:px-4"
              >
                <Icon name="crown" size={15} />
                <span className="hidden font-body text-sm font-semibold sm:inline">Premium</span>
              </button>
            ) : (
              <LikeBackButton
                liked={l.likedBack}
                busy={likingId === l.profile.userId}
                onClick={() => likeBack(l.profile.userId, l.likedBack)}
              />
            )}
          </div>
        ))}
      </div>

      <PremiumGateModal
        open={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        title="Qui t’a aimé(e) ?"
        description="Découvre qui a aimé ton profil et deviens Premium pour leur répondre directement."
      />
    </AppShell>
  );
}
