'use client';

import { Icon } from '@/components/ui/Icon';
import { ProfilePhotoCover } from '@/components/yeoyo/ProfilePhotoCover';
import { INTENT_LABELS, type ProfileCard } from '@/lib/yeoyo/types';

export function ProfileDetailCard({
  profile,
  onLike,
  onMessage,
  liking,
}: {
  profile: ProfileCard;
  onLike: (userId: string) => void;
  onMessage: (userId: string) => void;
  liking?: boolean;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative">
        <ProfilePhotoCover photoUrl={profile.photoUrl} name={profile.firstName} heightPx={220} />
        {profile.verified && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg bg-background/90 px-2.5 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-verified" />
            <span className="font-body text-xs font-medium text-foreground">Vérifié IA</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => onLike(profile.userId)}
          disabled={liking}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-background/80 disabled:opacity-50"
          aria-label="Liker ce profil"
        >
          <Icon name="heart" size={16} />
        </button>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-headings text-base font-bold text-foreground">
              {profile.firstName}
            </span>
            <span className="ml-2 font-body text-sm text-muted-foreground">{profile.age} ans</span>
          </div>
          {profile.commune && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Icon name="map-pin" size={13} />
              <span className="font-body text-xs">{profile.commune}</span>
            </div>
          )}
        </div>
        {profile.job && <p className="font-body text-sm text-muted-foreground">{profile.job}</p>}
        <div className="mt-1 flex items-center gap-1.5">
          <Icon name="gem" size={12} />
          <span className="font-body text-xs font-medium text-primary">
            {INTENT_LABELS[profile.intent] ?? profile.intent}
          </span>
        </div>
        {profile.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {profile.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-muted px-2.5 py-1 font-body text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => onMessage(profile.userId)}
          disabled={liking}
          className="mt-2 w-full rounded-lg bg-primary py-2.5 font-headings text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Envoyer un message
        </button>
      </div>
    </div>
  );
}
