'use client';

// Multi-photo cover with a WhatsApp/Instagram-status-style segmented
// progress bar (2026-08-10, user-driven: "comme on fait sur statut
// WhatsApp... permettre à l'homme de scroller pour savoir qu'il a trois
// photos"). Renders nothing extra when there's 0-1 photo — the segmented
// bar only makes sense once there's something to page through. Left/right
// tap zones (not a drag gesture) advance the index; both stopPropagation
// their pointerdown so this never gets swallowed by an ancestor's own
// drag-to-like/pass handling (SwipeCard) or read as "open the profile"
// (the card-level tap-to-navigate).
import { useState } from 'react';
import { ProfilePhotoCover } from '@/components/yeoyo/ProfilePhotoCover';

export function PhotoCarousel({
  photoUrls,
  name,
  heightPx = 220,
}: {
  photoUrls: string[];
  name: string;
  heightPx?: number;
}) {
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(photoUrls.length - 1, 0));
  const current = photoUrls[safeIndex] ?? null;

  function go(delta: number, e: React.PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    e.preventDefault();
    setIndex((i) => Math.min(Math.max(i + delta, 0), photoUrls.length - 1));
  }

  return (
    <div className="relative">
      <ProfilePhotoCover photoUrl={current} name={name} heightPx={heightPx} />
      {photoUrls.length > 1 && (
        <>
          <div className="absolute inset-x-2 top-2 z-10 flex gap-1">
            {photoUrls.map((url, i) => (
              <div key={url + i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                <div
                  className={`h-full rounded-full bg-white transition-all ${i <= safeIndex ? 'w-full' : 'w-0'}`}
                />
              </div>
            ))}
          </div>
          {safeIndex > 0 && (
            <button
              type="button"
              aria-label="Photo précédente"
              onPointerDown={(e) => go(-1, e)}
              className="absolute inset-y-0 left-0 z-[5] w-1/3"
            />
          )}
          {safeIndex < photoUrls.length - 1 && (
            <button
              type="button"
              aria-label="Photo suivante"
              onPointerDown={(e) => go(1, e)}
              className="absolute inset-y-0 right-0 z-[5] w-1/3"
            />
          )}
        </>
      )}
    </div>
  );
}
