'use client';

import Link from 'next/link';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Icon } from '@/components/ui/Icon';
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

// Renders the last-message line — a plain string for text, or a small
// camera glyph + "Photo" for an image-only message (matches how WhatsApp's
// own list previews an attachment without a caption).
function previewLine(lastMessage: { body: string; hasImage: boolean; fromSelf: boolean } | null): {
  icon: boolean;
  text: string;
} {
  if (!lastMessage) return { icon: false, text: 'Conversation démarrée' };
  const prefix = lastMessage.fromSelf ? 'Toi : ' : '';
  if (!lastMessage.body && lastMessage.hasImage) return { icon: true, text: `${prefix}Photo` };
  return { icon: false, text: `${prefix}${lastMessage.body}` };
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
  lastMessage: { body: string; hasImage: boolean; createdAt: string; fromSelf: boolean } | null;
  unreadCount: number;
  active?: boolean;
}) {
  const preview = previewLine(lastMessage);
  const unread = unreadCount > 0 && !lastMessage?.fromSelf;

  return (
    <Link
      href={`/app/messages/${id}`}
      className={`flex items-center gap-3 border-b border-border/60 px-3 py-3.5 transition-colors last:border-b-0 ${
        active ? 'bg-secondary/60' : 'hover:bg-muted/40'
      }`}
    >
      <UserAvatar name={otherUser.firstName} avatarUrl={otherUser.photoUrl} size={50} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-headings text-sm font-semibold text-foreground">
            {otherUser.firstName}
          </span>
          {lastMessage && (
            <span
              className={`flex-shrink-0 font-body text-xs ${unread ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
            >
              {timeLabel(lastMessage.createdAt)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1">
          {preview.icon && (
            <Icon name="image" size={12} className="flex-shrink-0 text-muted-foreground" />
          )}
          <p
            className={`truncate font-body text-xs ${
              unread ? 'font-semibold text-foreground' : 'text-muted-foreground'
            }`}
          >
            {preview.text}
          </p>
        </div>
      </div>
      {unreadCount > 0 && (
        <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-body text-xs font-bold text-primary-foreground">
          {unreadCount}
        </span>
      )}
    </Link>
  );
}
