'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';

// Message Flash (2026-08-27) — pay credits to attach a personalized
// message to a contact request, visible to the target before she accepts.
// Cost is display-only here — the real enforcement lives server-side in
// CREDIT_COSTS.flash_message (lib/server/credits/ledger.ts, a `server-only`
// module this client component can't import). Same reasoning as
// SwipeCard.tsx's own FREE_MONTHLY_CONTACT_REQUEST_LIMIT constant — keep
// this value in sync with the server if it ever changes.
const FLASH_MESSAGE_COST = 3;
const MAX_LENGTH = 2000;

export function FlashMessageModal({
  open,
  onClose,
  balance,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  balance: number;
  onSend: (message: string) => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const insufficient = balance < FLASH_MESSAGE_COST;

  function handleClose() {
    setMessage('');
    onClose();
  }

  return (
    <Sheet open={open} onClose={handleClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
            <Icon name="zap" size={22} />
          </div>
          <div>
            <p className="font-headings text-lg font-bold text-foreground">Message flash</p>
            <p className="font-body text-sm text-muted-foreground">
              Envoie un message directement, sans attendre qu&rsquo;elle accepte ta demande.
            </p>
          </div>
        </div>

        {insufficient ? (
          <>
            <p className="font-body text-sm text-muted-foreground">
              Le message flash coûte {FLASH_MESSAGE_COST} crédits. Il te reste {balance} crédit
              {balance > 1 ? 's' : ''} — achète un pack pour continuer.
            </p>
            <button
              type="button"
              onClick={() => router.push('/app/credits')}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-body text-sm font-bold text-primary-foreground transition-transform active:scale-95"
            >
              <Icon name="gem" size={16} />
              Acheter des crédits
            </button>
          </>
        ) : (
          <>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
              placeholder="Écris ton message…"
              rows={4}
              className="w-full resize-none rounded-xl border border-border bg-background p-3 font-body text-sm text-foreground"
            />
            <p className="text-right font-body text-xs text-muted-foreground">
              {message.length}/{MAX_LENGTH}
            </p>
            <p className="font-body text-xs text-muted-foreground">
              Coûte {FLASH_MESSAGE_COST} crédits, non remboursable même si elle refuse. Ton solde
              actuel : {balance} crédit{balance > 1 ? 's' : ''}.
            </p>
            <button
              type="button"
              onClick={() => onSend(message.trim())}
              disabled={message.trim().length === 0}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-body text-sm font-bold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
            >
              <Icon name="zap" size={16} />
              Envoyer — {FLASH_MESSAGE_COST} crédits
            </button>
          </>
        )}

        <button
          type="button"
          onClick={handleClose}
          className="flex h-12 items-center justify-center rounded-full border border-border font-body text-sm font-medium text-muted-foreground transition-transform active:scale-95"
        >
          Plus tard
        </button>
      </div>
    </Sheet>
  );
}
