'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { INTENT_LABELS, type ProfileCard } from '@/lib/yeoyo/types';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  VIEWED: 'Vue',
  ACCEPTED: 'Acceptée',
  CANCELLED: 'Refusée',
};

export function ContactRequestCard({
  otherUser,
  status,
  direction,
  conversationId,
  onAccept,
  onDecline,
  responding,
}: {
  otherUser: ProfileCard;
  status: string;
  direction: 'received' | 'sent';
  conversationId?: string | null;
  onAccept?: () => void;
  onDecline?: () => void;
  responding?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
      <UserAvatar name={otherUser.firstName} avatarUrl={otherUser.photoUrl} size={56} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-headings text-base font-bold text-foreground">
            {otherUser.firstName}
          </span>
          <span className="font-body text-sm text-muted-foreground">{otherUser.age} ans</span>
          {otherUser.verified && <div className="h-1.5 w-1.5 rounded-full bg-verified" />}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
          <Icon name="gem" size={11} />
          <span className="font-body text-xs">
            {INTENT_LABELS[otherUser.intent] ?? otherUser.intent}
          </span>
          {otherUser.commune && (
            <>
              <span className="text-border">•</span>
              <Icon name="map-pin" size={11} />
              <span className="font-body text-xs">{otherUser.commune}</span>
            </>
          )}
        </div>
      </div>

      {direction === 'received' && status === 'PENDING' ? (
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDecline}
            disabled={responding}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground disabled:opacity-50"
            aria-label="Refuser"
          >
            {responding ? (
              <Icon name="refresh-cw" size={16} className="animate-spin" />
            ) : (
              <Icon name="x" size={16} />
            )}
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={responding}
            className="btn-success-flash flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50"
          >
            {responding ? (
              <Icon name="refresh-cw" size={16} className="animate-spin" />
            ) : (
              <Icon name="check" size={16} />
            )}
            <span className="font-body text-sm font-semibold">Accepter</span>
          </button>
        </div>
      ) : status === 'ACCEPTED' && conversationId ? (
        <Link
          href={`/app/messages/${conversationId}`}
          className="flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 font-body text-sm font-semibold text-primary-foreground"
        >
          <Icon name="message-circle" size={15} />
          Message
        </Link>
      ) : (
        <span className="flex-shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 font-body text-xs font-medium text-muted-foreground">
          {STATUS_LABELS[status] ?? status}
        </span>
      )}
    </div>
  );
}
