'use client';

import type { ReactNode } from 'react';

// Generic centered overlay modal — backdrop click or explicit close both
// call `onClose`. Reuses the app's existing `.animate-fade-in`/
// `.animate-scale-in` classes (already defined in globals.css) so no new
// animation primitives are needed. Content is fully caller-defined; see
// PremiumGateModal.tsx for the Premium-upsell variant.
export function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-scale-in w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
