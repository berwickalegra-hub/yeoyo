'use client';

import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { INTENT_LABELS, type ProfileCard } from '@/lib/yeoyo/types';

// 2026-08-28 (explicit user ask): the three request kinds must read as
// visually distinct so the user instantly knows *what is happening* —
//   received + PENDING  → terracotta accent, "à toi de répondre"
//   sent + PENDING      → grey accent, "tu attends sa réponse"
//   ACCEPTED (contact)  → green accent, "vous êtes en contact"
// The accent is a left bar + a matching status pill; the action buttons
// are unchanged.

type Kind = 'received-pending' | 'sent-pending' | 'contact' | 'neutral';

function kindOf(direction: 'received' | 'sent', status: string): Kind {
  if (status === 'ACCEPTED') return 'contact';
  if (status === 'PENDING' || status === 'VIEWED') {
    return direction === 'received' ? 'received-pending' : 'sent-pending';
  }
  return 'neutral';
}

const KIND_STYLES: Record<Kind, { bar: string; pill: string; icon: IconName; label: string }> = {
  'received-pending': {
    bar: 'border-l-primary',
    pill: 'bg-primary/10 text-primary',
    icon: 'inbox',
    label: 'En attente de ta réponse',
  },
  'sent-pending': {
    bar: 'border-l-muted-foreground/40',
    pill: 'bg-muted text-muted-foreground',
    icon: 'send',
    label: 'En attente de sa réponse',
  },
  contact: {
    bar: 'border-l-verified',
    pill: 'bg-verified/10 text-verified',
    icon: 'check-circle',
    label: 'Vous êtes en contact',
  },
  neutral: {
    bar: 'border-l-border',
    pill: 'bg-muted text-muted-foreground',
    icon: 'clock',
    label: 'Sans suite',
  },
};

export function ContactRequestCard({
  otherUser,
  status,
  direction,
  conversationId,
  flashMessageBody,
  onAccept,
  onDecline,
  onWithdraw,
  responding,
}: {
  otherUser: ProfileCard;
  status: string;
  direction: 'received' | 'sent';
  conversationId?: string | null;
  flashMessageBody?: string | null;
  onAccept?: () => void;
  onDecline?: () => void;
  /** Sent + still PENDING only — retract a request before the other side responds. */
  onWithdraw?: (() => void) | undefined;
  responding?: boolean;
}) {
  const kind = kindOf(direction, status);
  const s = KIND_STYLES[kind];

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border border-l-4 border-border bg-surface p-4 ${s.bar}`}
    >
      <span
        className={`flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 font-body text-[11px] font-semibold ${s.pill}`}
      >
        <Icon name={s.icon} size={11} />
        {s.label}
      </span>

      <div className="flex items-center gap-4">
        <Link
          href={`/app/profils/${otherUser.userId}`}
          className="flex min-w-0 flex-1 items-center gap-4"
        >
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
              {(otherUser.city || otherUser.commune) && (
                <>
                  <span className="text-border">•</span>
                  <Icon name="map-pin" size={11} />
                  <span className="font-body text-xs">
                    {[otherUser.city, otherUser.commune].filter(Boolean).join(', ')}
                  </span>
                </>
              )}
            </div>
          </div>
        </Link>

        {direction === 'received' && (status === 'PENDING' || status === 'VIEWED') ? (
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onDecline}
              disabled={responding}
              className="btn-press flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground disabled:opacity-50"
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
              className="btn-success-flash btn-press flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-primary-foreground disabled:opacity-50"
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
        ) : direction === 'sent' && (status === 'PENDING' || status === 'VIEWED') && onWithdraw ? (
          <button
            type="button"
            onClick={onWithdraw}
            disabled={responding}
            className="btn-press flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 font-body text-xs font-medium text-muted-foreground transition-colors hover:border-red-400/40 hover:text-red-400 disabled:opacity-50"
          >
            {responding ? (
              <Icon name="refresh-cw" size={14} className="animate-spin" />
            ) : (
              <Icon name="x" size={14} />
            )}
            Retirer
          </button>
        ) : null}
      </div>

      {flashMessageBody && (
        <div className="flex items-start gap-2 rounded-lg bg-gold/10 px-3 py-2">
          <Icon name="zap" size={14} className="mt-0.5 flex-shrink-0 text-gold" />
          <p className="font-body text-sm italic text-foreground">
            &ldquo;{flashMessageBody}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
