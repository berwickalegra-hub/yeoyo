'use client';

import type { ReactNode } from 'react';

// Generic bottom sheet — backdrop click or explicit close both call
// onClose. Slides up from the bottom edge (see `.animate-sheet-slide-up`
// in globals.css), unlike Modal.tsx's centered scale-in — for content
// that reads better anchored to the bottom on mobile. First consumer:
// FlashMessageModal.tsx.
export function Sheet({
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
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-sheet-slide-up w-full max-w-sm rounded-t-2xl bg-surface p-6 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
