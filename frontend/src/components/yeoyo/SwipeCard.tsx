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
  onFavorite,
  favoriteBusy,
  busy,
}: {
  profile: ProfileCard;
  onDismiss: (userId: string) => void;
  onMessage: (userId: string) => void;
  onLike: (userId: string) => void;
  onFavorite?: (userId: string) => void;
  favoriteBusy?: boolean;
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
          {profile.boosted && (
            <div
              className={`absolute left-3 flex items-center gap-1 rounded-xl bg-primary px-2.5 py-1 ${hasMultiplePhotos ? 'top-6' : 'top-3'}`}
            >
              <Icon name="zap" size={11} className="text-primary-foreground" />
              <span className="font-body text-xs font-semibold text-primary-foreground">
                En avant
              </span>
            </div>
          )}
          {onFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFavorite(profile.userId);
              }}
              disabled={favoriteBusy}
              aria-label={profile.favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className={`absolute right-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 ${hasMultiplePhotos ? 'top-6' : 'top-3'} ${favoriteBusy ? 'opacity-50' : ''}`}
            >
              <Icon
                name="star"
                size={16}
                fill={profile.favorited ? 'currentColor' : 'none'}
                className={profile.favorited ? 'text-gold' : 'text-foreground'}
              />
            </button>
          )}
          {likeOpacity > 0 && (
            <div
              className="absolute right-4 top-4 rotate-12 rounded-lg border-4 border-primary px-3 py-1"
              style={{ opacity: likeOpacity }}
            >
              <span className="font-headings text-lg font-bold text-primary">DEMANDER</span>
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
              {profile.verified && (
                <span className="flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5">
                  <Icon name="shield-check" size={12} className="text-verified" />
                  <span className="font-body text-xs font-medium text-white">Vérifié</span>
                </span>
              )}
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
                    className="rounded-lg bg-white/15 px-2 py-1 font-body text-xs text-white"
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

      {/* Fixed footer — never scrolls with the photo/info above it. Matches
          Banani's DiscoverScreen action row exactly (2026-08-14 fidelity
          pass): X = soft-red circle, terracotta icon (h-14, not h-12);
          Message = bare accent-bordered icon circle, NO text label (Banani's
          own button has no text — ours previously added one, a drift);
          third button = a wide secondary pill with a plus icon + label,
          relabeled "Demander" (was "Ajouter") to match the exact same
          action's label on the profile-detail page — both buttons call the
          identical POST /api/likes (like + auto contact request), so using
          one label everywhere keeps the app's terminology predictable. */}
      <div
        className="flex flex-shrink-0 items-center justify-center gap-5 border-t border-border bg-surface px-4 py-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onDismiss(profile.userId)}
          disabled={busy}
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border-2 border-red-200 bg-red-50 text-primary disabled:opacity-50"
          aria-label="Passer ce profil"
        >
          <Icon name="x" size={22} />
        </button>
        <button
          type="button"
          onClick={() => onMessage(profile.userId)}
          disabled={busy}
          aria-label="Envoyer un message"
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 border-accent bg-accent/10 text-accent disabled:opacity-50"
        >
          {busy ? (
            <Icon name="refresh-cw" size={17} className="animate-spin" />
          ) : (
            <Icon name="message-circle" size={19} />
          )}
        </button>
        <button
          type="button"
          onClick={() => onLike(profile.userId)}
          disabled={busy || liked}
          className={`btn-success-flash flex h-14 flex-shrink-0 items-center justify-center gap-2 rounded-full px-6 font-body text-sm font-bold transition-colors ${busy ? 'opacity-50' : ''} ${liked ? 'bg-secondary/70 text-secondary-foreground' : 'bg-secondary text-secondary-foreground'}`}
        >
          {busy ? (
            <Icon name="refresh-cw" size={16} className="animate-spin" />
          ) : (
            <Icon name="plus" size={16} className={popping ? 'animate-heart-pop' : ''} />
          )}
          {liked ? 'Envoyée' : 'Demander'}
        </button>
      </div>
    </div>
  );
}
