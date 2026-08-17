'use client';

// Full-size photo viewer. Tap the photo, name, or close button to shrink
// back down (2026-08-14). Lives only on the profile-detail page
// (`/app/profils/[userId]`) — it used to also sit on the Explorer/Découvrir
// swipe card, but tapping a photo there is also the multi-photo carousel's
// prev/next gesture and sits right under the favorite star button, so a
// second competing tap target caused real click conflicts (explicit user
// report, 2026-08-14: clicking the star opened the lightbox instead).
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
