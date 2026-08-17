'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';

// Shared Premium upsell modal — shown instead of a hard router.push when a
// free-tier user hits a Premium-gated action (2026-08-17, explicit user
// ask: "je veux qu'il y ait un modal... demandé s'il veut passer en
// premium ou le faire au plus tard", modeled on a reference screenshot).
// "Devenir Premium" navigates to checkout; "Plus tard" just closes the
// modal and leaves the user where they were — no forced redirect.
export function PremiumGateModal({
  open,
  onClose,
  title,
  description,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
}) {
  const router = useRouter();

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/15">
          <Icon name="crown" size={26} className="text-gold" />
        </div>
        <div>
          <p className="font-headings text-lg font-bold text-foreground">{title}</p>
          <p className="mt-1.5 font-body text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={() => router.push('/app/premium')}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-gold font-body text-sm font-bold text-gold-foreground transition-transform active:scale-95"
          >
            <Icon name="crown" size={16} />
            Devenir Premium
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
