'use client';

// Compact grid card for Découvrir's "Sélection pour toi" — replaces the
// horizontal-scroll strip (2026-08-10, after a reference dating app's
// "Accueil" grid was shown in chat: a wrapping grid + "Voir tous les
// profils" CTA reads better than a native horizontal scrollbar, especially
// on mobile). Deliberately no Message/Passer buttons — those live on
// Explorer now; this card is a lightweight teaser, one heart action to
// like directly, everything else routes through "Voir tous les profils".
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ProfilePhotoCover } from '@/components/yeoyo/ProfilePhotoCover';
import type { ProfileCard } from '@/lib/yeoyo/types';

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
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative">
        <Link href={`/app/profils/${profile.userId}`} className="block">
          <ProfilePhotoCover photoUrl={profile.photoUrl} name={profile.firstName} heightPx={140} />
          {profile.verified && (
            <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-0.5">
              <div className="h-1.5 w-1.5 rounded-full bg-verified" />
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
          disabled={liking}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-primary disabled:opacity-50"
          aria-label="Aimer ce profil"
        >
          <Icon name="heart" size={14} />
        </button>
      </div>

      <Link href={`/app/profils/${profile.userId}`} className="flex flex-col gap-0.5 px-3 py-2.5">
        <div className="flex items-baseline gap-1">
          <span className="font-headings text-sm font-bold text-foreground">
            {profile.firstName}
          </span>
          <span className="font-body text-xs text-muted-foreground">{profile.age} ans</span>
        </div>
        {profile.commune && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Icon name="map-pin" size={10} />
            <span className="font-body text-[11px]">{profile.commune}</span>
          </div>
        )}
        {profile.job && (
          <p className="truncate font-body text-[11px] text-muted-foreground">{profile.job}</p>
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
