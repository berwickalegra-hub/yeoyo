'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { UserAvatar } from '@/components/ui/UserAvatar';

// Shown when a contact request is accepted, instead of a plain toast +
// silent redirect (2026-08-21, explicit user ask: a match must read as
// "quelque chose de nouveau commence entre eux", not a status flip nobody
// notices). "Dire bonjour" routes straight into the new conversation;
// "Plus tard" just closes and leaves the user on Demandes.
export function MatchModal({
  open,
  onClose,
  conversationId,
  otherName,
  otherPhotoUrl,
  myName,
  myAvatarUrl,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  otherName: string;
  otherPhotoUrl?: string | null;
  myName: string;
  myAvatarUrl?: string | null;
}) {
  const router = useRouter();

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="font-body text-xs font-semibold uppercase tracking-wide text-gold">
          C&rsquo;est un match
        </span>
        <div className="flex items-center justify-center">
          <UserAvatar
            name={myName}
            avatarUrl={myAvatarUrl}
            size={72}
            className="ring-4 ring-background"
          />
          <div className="animate-heartbeat -mx-3 z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
            <Icon name="heart" size={18} fill="currentColor" />
          </div>
          <UserAvatar
            name={otherName}
            avatarUrl={otherPhotoUrl}
            size={72}
            className="ring-4 ring-background"
          />
        </div>
        <div>
          <p className="font-headings text-xl font-bold text-foreground">
            Toi et {otherName}, ça matche !
          </p>
          <p className="mt-1.5 font-body text-sm text-muted-foreground">
            Quelque chose de nouveau commence. Envoie le premier message maintenant.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={() => router.push(`/app/messages/${conversationId}`)}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-body text-sm font-bold text-primary-foreground transition-transform active:scale-95"
          >
            <Icon name="message-circle" size={16} />
            Dire bonjour
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 items-center justify-center rounded-full border border-border font-body text-sm font-medium text-muted-foreground transition-transform active:scale-95"
          >
            Plus tard
          </button>
        </div>
      </div>
    </Modal>
  );
}
