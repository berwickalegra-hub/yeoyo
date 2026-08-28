'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Responsive sheet/modal — backdrop click or explicit close both call
// onClose. Below `md`: slides up from the bottom edge (see
// `.animate-sheet-slide-up` in globals.css) — the mobile-native "bottom
// sheet" feel. From `md` up: a centered, scaled-in dialog matching
// Modal.tsx's desktop treatment (2026-08-28 fix, explicit user report — a
// bottom sheet stretched full-width and pinned to the bottom edge read as
// broken on a wide desktop viewport, "ça ne s'affiche pas correctement sur
// le web"). One component, two presentations: `md:items-center` +
// `md:animate-scale-in` + `md:rounded-2xl` all override their mobile
// counterparts at the breakpoint (same class-pair pattern as `flex-col
// md:flex-row`) rather than branching into two render paths. First
// consumer: FlashMessageModal.tsx.
//
// Rendered via a portal to document.body (2026-08-28 fix — reported as
// "the modal doesn't display correctly" when opened from SwipeCard): an
// ancestor with an inline `transform` (e.g. SwipeCard's drag wrapper, or
// even its own `animate-fade-in-up` entrance sitting at its resting
// translateY(0)) becomes a containing block for `position: fixed`
// descendants per the CSS spec, so a plain nested fixed sheet ends up
// pinned to that ancestor's box instead of the viewport — same issue
// PhotoLightbox.tsx already documents and fixes the same way. `open`
// already gates rendering (the guard below), so there's no SSR concern:
// this never reaches `createPortal` during the initial server render as
// long as the caller's `open` state starts `false`.
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

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/50 md:items-center md:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-sheet-slide-up w-full max-w-sm rounded-t-2xl bg-surface p-6 pb-8 shadow-2xl md:animate-scale-in md:rounded-2xl md:pb-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
