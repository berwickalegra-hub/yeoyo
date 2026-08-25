'use client';

// Full profile card for Explorer's grid view mode (2026-08-10 — user
// wanted a toggle between the swipe deck and a classic grid, matching a
// reference app's grey grid-view button). One column on mobile so the
// action row has room to breathe (2-up/3-up from sm/lg). The direct
// "Message" shortcut was removed 2026-08-25 — messaging now only opens
// once a contact request is accepted (see credits/ledger.ts's
// first_message gate).
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ProfilePhotoCover } from '@/components/yeoyo/ProfilePhotoCover';
import { INTENT_LABELS, type ProfileCard } from '@/lib/yeoyo/types';
import { useLikePop } from '@/lib/yeoyo/useLikePop';
import { useCardExit } from '@/lib/yeoyo/useCardExit';

export function ProfileGridCard({
  profile,
  onLike,
  onDismiss,
  onFavorite,
  favoriteBusy,
  busy,
}: {
  profile: ProfileCard;
  onLike: (userId: string) => void;
  onDismiss: (userId: string) => void;
  onFavorite?: (userId: string) => void;
  favoriteBusy?: boolean;
  busy?: boolean;
}) {
  const liked = profile.liked ?? false;
  const popping = useLikePop(liked);
  const { exitClassName, trigger } = useCardExit();

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${exitClassName}`}
    >
      <Link href={`/app/profils/${profile.userId}`} className="block">
        <div className="relative">
          <ProfilePhotoCover photoUrl={profile.photoUrl} name={profile.firstName} heightPx={200} />
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            {profile.boosted && (
              <div className="flex items-center gap-1 rounded-xl bg-primary px-2 py-1">
                <Icon name="zap" size={10} className="text-primary-foreground" />
                <span className="font-body text-[11px] font-semibold text-primary-foreground">
                  En avant
                </span>
              </div>
            )}
            {profile.verified && (
              <div className="flex items-center gap-1.5 rounded-lg bg-background/90 px-2.5 py-1">
                <div className="h-1.5 w-1.5 rounded-full bg-verified" />
                <span className="font-body text-xs font-medium text-foreground">Vérifié IA</span>
              </div>
            )}
          </div>
          {onFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onFavorite(profile.userId);
              }}
              disabled={favoriteBusy}
              aria-label={profile.favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 ${favoriteBusy ? 'opacity-50' : ''}`}
            >
              <Icon
                name="star"
                size={15}
                fill={profile.favorited ? 'currentColor' : 'none'}
                className={profile.favorited ? 'text-gold' : 'text-foreground'}
              />
            </button>
          )}
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-background/90 px-2.5 py-1">
            <Icon name="gem" size={11} />
            <span className="font-body text-xs font-medium text-primary">
              {INTENT_LABELS[profile.intent] ?? profile.intent}
            </span>
          </div>
          {profile.photoUrls.length > 1 && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg bg-background/90 px-2 py-1">
              <Icon name="camera" size={11} />
              <span className="font-body text-xs font-medium text-foreground">
                {profile.photoUrls.length}
              </span>
            </div>
          )}
        </div>

        <div className="px-4 pb-2 pt-3">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-headings text-base font-bold text-foreground">
                {profile.firstName}
              </span>
              <span className="ml-2 font-body text-sm text-muted-foreground">
                {profile.age} ans
              </span>
            </div>
            {profile.commune && (
              <div className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                <Icon name="map-pin" size={12} />
                <span className="font-body text-xs">{profile.commune}</span>
              </div>
            )}
          </div>
          {(profile.job || profile.tags[0]) && (
            <p className="mt-0.5 font-body text-sm text-muted-foreground">
              {[profile.job, profile.tags[0]].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </Link>

      <div className="mt-auto px-4 pb-4">
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => trigger('left', () => onDismiss(profile.userId))}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground"
            aria-label="Passer ce profil"
          >
            <Icon name="x" size={18} />
          </button>
          <button
            type="button"
            onClick={() => onLike(profile.userId)}
            disabled={busy || liked}
            aria-label={liked ? 'Déjà aimé' : 'Liker ce profil'}
            className={`btn-success-flash flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg font-body text-sm font-medium transition-colors ${busy ? 'opacity-50' : ''} ${liked ? 'bg-primary text-primary-foreground' : 'border-2 border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary'}`}
          >
            {busy ? (
              <Icon name="refresh-cw" size={18} className="animate-spin" />
            ) : (
              <Icon
                name="heart"
                size={18}
                fill={liked ? 'currentColor' : 'none'}
                className={popping ? 'animate-heart-pop' : ''}
              />
            )}
            <span>{liked ? 'Envoyée' : 'Demander'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
