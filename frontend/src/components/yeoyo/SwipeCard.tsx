'use client';

// Single-profile swipe card — Découvrir/Explorer's centered, mobile-first
// card (redesigned 2026-08-07, then again 2026-08-10 after a reference
// dating app screenshot showing a fixed card frame: the title bar and the
// 3-button action row never move, only the photo + info scroll *inside*
// the card). The card itself is a fixed-height flex column —
// `flex-1 overflow-y-auto` on the photo+info wrapper is the only part that
// scrolls; the action row is a flex-shrink-0 footer, not `position: fixed`
// against the viewport anymore (that was the previous approach, duplicated
// the row for mobile vs desktop — this one layout now works at every size).
//
// Multi-photo carousel (2026-08-10): PhotoCarousel renders a WhatsApp
// status-style segmented bar + left/right tap zones when a profile has more
// than one photo — see components/yeoyo/PhotoCarousel.tsx.
//
// Horizontal drag (mouse or touch, via the Pointer Events API) on the
// photo/info section mirrors the action row: drag right past the threshold
// = Aimer, left = Passer. A plain tap (drag distance under CLICK_THRESHOLD)
// opens the full profile detail screen (`/app/profils/[userId]`) — action
// buttons and the photo carousel's tap zones stopPropagation their
// pointerdown so tapping them doesn't also count as "open profile".
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { PhotoCarousel } from '@/components/yeoyo/PhotoCarousel';
import { ProfileInfoSections } from '@/components/yeoyo/ProfileInfoSections';
import type { ProfileCard } from '@/lib/yeoyo/types';
import { useLikePop } from '@/lib/yeoyo/useLikePop';

const SWIPE_THRESHOLD = 90;
const CLICK_THRESHOLD = 6;

export function SwipeCard({
  profile,
  onDismiss,
  onMessage,
  onLike,
  busy,
}: {
  profile: ProfileCard;
  onDismiss: (userId: string) => void;
  onMessage: (userId: string) => void;
  onLike: (userId: string) => void;
  busy?: boolean;
}) {
  const router = useRouter();
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);

  const liked = profile.liked ?? false;
  const popping = useLikePop(liked);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (busy) return;
    pointerIdRef.current = e.pointerId;
    startXRef.current = e.clientX;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || pointerIdRef.current !== e.pointerId) return;
    setDragX(e.clientX - startXRef.current);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    setDragging(false);
    if (dragX > SWIPE_THRESHOLD) {
      onLike(profile.userId);
    } else if (dragX < -SWIPE_THRESHOLD) {
      onDismiss(profile.userId);
    } else if (Math.abs(dragX) < CLICK_THRESHOLD) {
      router.push(`/app/profils/${profile.userId}`);
    }
    setDragX(0);
  }

  const likeOpacity = Math.min(Math.max(dragX / SWIPE_THRESHOLD, 0), 1);
  const passOpacity = Math.min(Math.max(-dragX / SWIPE_THRESHOLD, 0), 1);
  const hasMultiplePhotos = profile.photoUrls.length > 1;

  return (
    <div className="animate-fade-in-up mx-auto flex h-[calc(100dvh-13rem)] max-h-[680px] min-h-[440px] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-surface md:h-[640px]">
      <div
        className="relative flex-1 touch-pan-y select-none overflow-y-auto"
        style={{
          transform: `translateX(${dragX}px) rotate(${dragX / 20}deg)`,
          transition: dragging ? 'none' : 'transform 0.25s ease',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="relative">
          <PhotoCarousel photoUrls={profile.photoUrls} name={profile.firstName} heightPx={340} />
          {profile.verified && (
            <div
              className={`absolute left-3 flex items-center gap-1.5 rounded-lg bg-background/90 px-2.5 py-1 ${hasMultiplePhotos ? 'top-6' : 'top-3'}`}
            >
              <div className="h-1.5 w-1.5 rounded-full bg-verified" />
              <span className="font-body text-xs font-medium text-foreground">Vérifié IA</span>
            </div>
          )}
          {likeOpacity > 0 && (
            <div
              className="absolute right-4 top-4 rotate-12 rounded-lg border-4 border-primary px-3 py-1"
              style={{ opacity: likeOpacity }}
            >
              <span className="font-headings text-lg font-bold text-primary">J&rsquo;AIME</span>
            </div>
          )}
          {passOpacity > 0 && (
            <div
              className="absolute left-4 top-4 -rotate-12 rounded-lg border-4 border-red-400 px-3 py-1"
              style={{ opacity: passOpacity }}
            >
              <span className="font-headings text-lg font-bold text-red-400">PASSER</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-3 pt-14">
            <div className="flex items-baseline gap-2">
              <span className="font-headings text-xl font-bold text-white">
                {profile.firstName}
              </span>
              <span className="font-body text-base text-white/80">{profile.age} ans</span>
            </div>
            {profile.commune && (
              <div className="mt-1 flex items-center gap-1 text-white/80">
                <Icon name="map-pin" size={13} />
                <span className="font-body text-sm">{profile.commune}</span>
              </div>
            )}
            {profile.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {profile.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-white/15 px-2 py-1 font-body text-xs text-white"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <ProfileInfoSections profile={profile} />
        </div>
      </div>

      {/* Fixed footer — never scrolls with the photo/info above it. */}
      <div
        className="flex flex-shrink-0 items-center gap-3 border-t border-border bg-surface px-4 py-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onDismiss(profile.userId)}
          disabled={busy}
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-red-400/30 bg-red-500/5 text-red-400 disabled:opacity-50"
          aria-label="Passer ce profil"
        >
          <Icon name="x" size={20} />
        </button>
        <button
          type="button"
          onClick={() => onMessage(profile.userId)}
          disabled={busy}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background text-foreground disabled:opacity-50"
        >
          {busy ? (
            <Icon name="refresh-cw" size={17} className="animate-spin" />
          ) : (
            <Icon name="message-circle" size={17} />
          )}
          <span className="font-body text-sm font-semibold">Message</span>
        </button>
        <button
          type="button"
          onClick={() => onLike(profile.userId)}
          disabled={busy || liked}
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full btn-success-flash disabled:opacity-50 ${liked ? 'bg-primary/20 text-primary' : 'bg-primary text-primary-foreground'}`}
          aria-label={liked ? 'Déjà aimé' : 'Ajouter aux favoris'}
        >
          {busy ? (
            <Icon name="refresh-cw" size={20} className="animate-spin" />
          ) : (
            <Icon
              name="heart"
              size={20}
              fill={liked ? 'currentColor' : 'none'}
              className={popping ? 'animate-heart-pop' : ''}
            />
          )}
        </button>
      </div>
    </div>
  );
}
