'use client';

import Link from 'next/link';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Icon } from '@/components/ui/Icon';
import type { ProfileCard } from '@/lib/yeoyo/types';

// "Nouveaux matchs" strip above the Messages inbox (2026-08-28, explicit
// user ask, WhatsApp-status style). A match with no message yet lives ONLY
// here — as a gold-ringed circle. Tapping opens the thread; once the first
// message is sent the conversation gains a `lastMessage` and the caller
// drops it out of this strip and into the normal list on the next reload.
export interface MatchStory {
  conversationId: string;
  otherUser: ProfileCard;
}

export function MatchStories({
  matches,
  activeId,
}: {
  matches: MatchStory[];
  activeId?: string | undefined;
}) {
  if (matches.length === 0) return null;

  return (
    <div className="border-b border-border px-4 py-3">
      <p className="mb-2 flex items-center gap-1.5 font-body text-xs font-semibold text-foreground">
        <Icon name="sparkles" size={12} className="text-gold" />
        Nouveaux matchs
        <span className="rounded-full bg-gold/15 px-1.5 font-body text-[10px] font-bold text-gold">
          {matches.length}
        </span>
      </p>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {matches.map((m) => {
          const isActive = m.conversationId === activeId;
          return (
            <Link
              key={m.conversationId}
              href={`/app/messages/${m.conversationId}`}
              className="flex w-16 flex-shrink-0 flex-col items-center gap-1"
            >
              <span
                className={`rounded-full p-[2px] ${
                  isActive ? 'bg-primary' : 'bg-gradient-to-br from-[#e6ac44] to-[#a9761d]'
                }`}
              >
                <span className="block rounded-full border-2 border-surface">
                  <UserAvatar
                    name={m.otherUser.firstName}
                    avatarUrl={m.otherUser.photoUrl}
                    size={52}
                  />
                </span>
              </span>
              <span className="max-w-full truncate font-body text-[11px] text-foreground">
                {m.otherUser.firstName}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
