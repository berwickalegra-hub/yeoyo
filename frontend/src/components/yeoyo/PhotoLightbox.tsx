'use client';

// Full-size photo viewer. Tap the photo, name, or close button to shrink
// back down (2026-08-14). Used by the profile-detail page
// (`/app/profils/[userId]`) and, again as of 2026-08-19, by the Explorer/
// Découvrir swipe card (SwipeCard.tsx) — it briefly lived there before being
// pulled (2026-08-14) because the multi-photo carousel's prev/next zones and
// the favorite star both sat on top of it and caused click conflicts. Both
// of those now stopPropagation their own pointerdown/click (see
// PhotoCarousel.tsx and SwipeCard.tsx's favorite button), so a plain tap on
// the remaining open photo area is unambiguous again — SwipeCard wires it to
// open this lightbox instead of navigating to the profile (explicit
// 2026-08-19 user ask: tapping the photo shouldn't leave the deck).
// Rendered via a portal to document.body: an ancestor with an inline
// `transform` (e.g. a drag animation) becomes a containing block for
// `position: fixed` descendants per the CSS spec, so a plain nested fixed
// overlay could end up pinned to that ancestor instead of the viewport.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';

export function PhotoLightbox({
  photoUrl,
  name,
  onClose,
}: {
  photoUrl: string | null;
  name: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (!photoUrl) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo de ${name} en grand`}
      onClick={onClose}
      className="animate-fade-in-up fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Réduire la photo"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white"
      >
        <Icon name="x" size={22} />
      </button>
      {/* One-off full-viewport viewer — not worth next/image's fixed-container
          sizing here (same rationale as /app/profil's photo grid). */}
      <img
        src={photoUrl}
        alt={name}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="max-h-full max-w-full cursor-pointer rounded-lg object-contain"
      />
    </div>,
    document.body,
  );
}
