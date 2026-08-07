'use client';

import Link from 'next/link';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { ProfileCard } from '@/lib/yeoyo/types';

function timeLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'À l’instant';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

export function ConversationListItem({
  id,
  otherUser,
  lastMessage,
  unreadCount,
  active,
}: {
  id: string;
  otherUser: ProfileCard;
  lastMessage: { body: string; createdAt: string; fromSelf: boolean } | null;
  unreadCount: number;
  active?: boolean;
}) {
  return (
    <Link
      href={`/app/messages/${id}`}
      className={`flex items-center gap-3 rounded-lg px-3 py-3 ${active ? 'bg-secondary' : ''}`}
    >
      <UserAvatar name={otherUser.firstName} avatarUrl={otherUser.photoUrl} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-headings text-sm font-semibold text-foreground">
            {otherUser.firstName}
          </span>
          {lastMessage && (
            <span className="flex-shrink-0 font-body text-xs text-muted-foreground">
              {timeLabel(lastMessage.createdAt)}
            </span>
          )}
        </div>
        <p
          className={`truncate font-body text-xs ${
            unreadCount > 0 && !lastMessage?.fromSelf
              ? 'font-semibold text-foreground'
              : 'text-muted-foreground'
          }`}
        >
          {lastMessage
            ? lastMessage.fromSelf
              ? `Toi: ${lastMessage.body}`
              : lastMessage.body
            : 'Conversation démarrée'}
        </p>
      </div>
      {unreadCount > 0 && (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary font-body text-xs font-bold text-primary-foreground">
          {unreadCount}
        </span>
      )}
    </Link>
  );
}
