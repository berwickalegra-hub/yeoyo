'use client';

import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';

// Slim, always-visible strip at the very top of a conversation thread —
// the two matched profiles' photos overlapping around a heart, the same
// motif as the "C'est un match" modal (MatchModal). Every conversation in
// YeOyo comes from an accepted contact request, so "Vous avez matché" is
// always true here.
export function MatchedHeader({
  myName,
  myAvatarUrl,
  otherName,
  otherPhotoUrl,
}: {
  myName: string;
  myAvatarUrl?: string | null;
  otherName: string;
  otherPhotoUrl?: string | null;
}) {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-border bg-primary/[0.04] px-4 py-1.5">
      <div className="flex items-center">
        <UserAvatar
          name={myName}
          avatarUrl={myAvatarUrl}
          size={24}
          className="ring-2 ring-surface"
        />
        <span className="-mx-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Icon name="heart" size={10} fill="currentColor" />
        </span>
        <UserAvatar
          name={otherName}
          avatarUrl={otherPhotoUrl}
          size={24}
          className="ring-2 ring-surface"
        />
      </div>
      <span className="font-body text-xs font-medium text-muted-foreground">
        Vous avez matché avec {otherName}
      </span>
    </div>
  );
}
