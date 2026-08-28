'use client';

// Grid card for Découvrir's "Sélection pour toi" — reproduces Banani's
// ProfileCard.jsx: `aspect-[3/4]` photo (scales with card width, not a fixed
// pixel height), verified badge as a secondary-tinted pill with the
// shield-check icon + "Vérifié" label (top-left), name+age on one baseline,
// city (map-pin) and job (briefcase) each on their own line. The one
// deliberate divergence from Banani's mock: no numeric match-% badge — this
// project has no scoring algorithm, so a real, derived "why recommended"
// line (shared commune/religion/objectif) is shown instead.
//
// 2026-08-27 (explicit user ask): the top-right button is a *favorite*
// (bookmark) toggle — POST/DELETE /api/favorites, no credit, reversible —
// NOT a contact request. Contact requests are made from the full profile
// page (tap the card) or from Explorer. The favorite chip gets a small
// "premium" gold treatment when active so a shortlisted profile reads at a
// glance.
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ProfilePhotoCover } from '@/components/yeoyo/ProfilePhotoCover';
import type { ProfileCard } from '@/lib/yeoyo/types';
import { useLikePop } from '@/lib/yeoyo/useLikePop';

export function RecommendedProfileCard({
  profile,
  onFavorite,
  favoriteBusy,
  note,
}: {
  profile: ProfileCard;
  onFavorite: (userId: string) => void;
  favoriteBusy?: boolean;
  /** Real, derived "why recommended" line (shared commune/religion/objectif) — never a fabricated match score. */
  note?: string | undefined;
}) {
  const favorited = profile.favorited ?? false;
  // useLikePop bounces once on a false→true flip — reused verbatim for the
  // favorite star (not like-specific despite the name).
  const popping = useLikePop(favorited);

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
          onClick={() => onFavorite(profile.userId)}
          disabled={favoriteBusy}
          aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          className={`btn-press absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-sm transition-colors ${
            favoriteBusy ? 'opacity-50' : ''
          } ${
            favorited
              ? 'bg-gradient-to-br from-[#e6ac44] to-[#a9761d] text-gold-foreground shadow-md shadow-gold/40'
              : 'bg-surface/90 text-muted-foreground hover:text-gold'
          }`}
        >
          {favoriteBusy ? (
            <Icon name="refresh-cw" size={14} className="animate-spin" />
          ) : (
            <Icon
              name="star"
              size={15}
              fill={favorited ? 'currentColor' : 'none'}
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
        {(profile.city || profile.commune) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Icon name="map-pin" size={11} />
            <span className="font-body">
              {[profile.city, profile.commune].filter(Boolean).join(', ')}
            </span>
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
