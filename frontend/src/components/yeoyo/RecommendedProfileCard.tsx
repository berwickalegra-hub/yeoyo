'use client';

// Grid card for Découvrir's "Sélection pour toi" — reproduces Banani's
// ProfileCard.jsx verbatim (2026-08-14 fidelity pass): `aspect-[3/4]` photo
// (scales with card width, not a fixed pixel height), verified badge as a
// secondary-tinted pill with the shield-check icon + "Vérifié" label
// (top-left), a bare circular favorite button (top-right), name+age on one
// baseline, city (map-pin) and job (briefcase) each on their own line. The
// one deliberate divergence from Banani's mock: no numeric match-% badge —
// this project has no scoring algorithm, so a real, derived "why
// recommended" line (shared commune/religion/objectif) is shown instead of
// fabricating a percentage.
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ProfilePhotoCover } from '@/components/yeoyo/ProfilePhotoCover';
import type { ProfileCard } from '@/lib/yeoyo/types';
import { useLikePop } from '@/lib/yeoyo/useLikePop';

export function RecommendedProfileCard({
  profile,
  onLike,
  liking,
  note,
}: {
  profile: ProfileCard;
  onLike: (userId: string) => void;
  liking?: boolean;
  /** Real, derived "why recommended" line (shared commune/religion/objectif) — never a fabricated match score. */
  note?: string | undefined;
}) {
  const liked = profile.liked ?? false;
  const popping = useLikePop(liked);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative">
        <Link href={`/app/profils/${profile.userId}`} className="block">
          <ProfilePhotoCover
            photoUrl={profile.photoUrl}
            name={profile.firstName}
            aspectRatio="3/4"
          />
          {profile.verified && (
            <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
              <div className="flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 font-body text-xs font-bold text-secondary-foreground">
                <Icon name="shield-check" size={11} />
                Vérifié
              </div>
            </div>
          )}
          {profile.photoUrls.length > 1 && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-0.5">
              <Icon name="camera" size={10} />
              <span className="font-body text-[10px] font-medium text-foreground">
                {profile.photoUrls.length}
              </span>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={() => onLike(profile.userId)}
          disabled={liking || liked}
          aria-label={liked ? 'Déjà aimé' : 'Aimer ce profil'}
          className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-surface p-1.5 btn-success-flash ${liking ? 'opacity-50' : ''} ${liked ? 'text-primary' : 'text-muted-foreground'}`}
        >
          {liking ? (
            <Icon name="refresh-cw" size={14} className="animate-spin" />
          ) : (
            <Icon
              name="heart"
              size={14}
              fill={liked ? 'currentColor' : 'none'}
              className={popping ? 'animate-heart-pop' : ''}
            />
          )}
        </button>
      </div>

      <Link href={`/app/profils/${profile.userId}`} className="flex flex-col gap-1 p-3">
        <div className="flex items-baseline gap-1">
          <span className="font-headings text-base font-bold text-foreground">
            {profile.firstName}
          </span>
          <span className="font-body text-sm text-muted-foreground">{profile.age}</span>
        </div>
        {profile.commune && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Icon name="map-pin" size={11} />
            <span className="font-body">{profile.commune}</span>
          </div>
        )}
        {profile.job && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Icon name="briefcase" size={11} />
            <span className="truncate font-body">{profile.job}</span>
          </div>
        )}
        {note && (
          <p className="mt-0.5 flex items-center gap-1 font-body text-[11px] font-medium text-primary">
            <Icon name="sparkles" size={10} />
            {note}
          </p>
        )}
      </Link>
    </div>
  );
}
