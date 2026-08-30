'use client';

// Single-profile swipe card — Découvrir/Explorer's centered, mobile-first
// card (redesigned 2026-08-07, then again 2026-08-10, then again 2026-08-19
// after reference iPhone Safari screenshots — heavily inspired by a
// generated Banani screen the user pointed at directly, see
// DiscoverScreen.jsx in the "Rencontres Sérieuses Congo" flow: circular
// Passer/Message buttons, pill Demander, top-left boost badge, top-right
// favorite star).
//
// Mobile vs desktop are now genuinely different layouts, not just sized
// differently:
//   - Mobile: the card has NO height cap and NO internal scroll — it's a
//     normal block that grows to fit its content, and the PAGE (Explorer's
//     own scroll container) scrolls it. The 3-button action row is rendered
//     via a portal straight onto `document.body` as `position: fixed`,
//     floating just above MobileTabBar's "Accueil" bar, so it's on-screen
//     immediately regardless of card height, mobile Safari's collapsing
//     toolbar, or anything else fighting for vertical space above it
//     (explicit user report + screenshots, 2026-08-19: buttons were
//     scrolled out of view on first load).
//   - Desktop (`md:`): unchanged from before — bounded height
//     (`md:h-full md:max-h-[680px] md:min-h-[380px]`), the photo+info
//     wrapper scrolls internally, and the action row is a normal in-flow
//     footer glued to the card's own bottom edge. Desktop never had the
//     mobile-viewport problem, and a `position: fixed` bar was tried here
//     once already (2026-08-14) and reverted — it drifted relative to the
//     card on layouts where the card isn't full-width (the 3-column
//     Filtres/side-panel grid). Scoping the fixed treatment to `md:hidden`
//     avoids reproducing that regression.
// Both contexts render the exact same button markup (`renderActions()`)
// so the visual redesign is shared — only the container differs.
//
// The portal is required, not optional: an ancestor with any non-`none`
// `transform` (including the drag wrapper below, or even this card's own
// `animate-fade-in-up` entrance animation resting at `translateY(0)`)
// becomes a containing block for `position: fixed` descendants per the CSS
// spec — a plain nested fixed element would end up pinned to that ancestor
// instead of the viewport (same issue PhotoLightbox.tsx documents). Gated
// on a `mounted` flag so the initial server-render (which never actually
// reaches this component with real data — Explorer's deck loads
// client-side — but could in principle) never calls `document.body`.
//
// Multi-photo carousel (2026-08-10): PhotoCarousel renders a WhatsApp
// status-style segmented bar + left/right tap zones when a profile has more
// than one photo — see components/yeoyo/PhotoCarousel.tsx.
//
// Horizontal drag (mouse or touch, via the Pointer Events API) on the
// photo/info section mirrors the action row: drag right past the threshold
// = Aimer, left = Passer. Tapping the photo and tapping the name/info
// overlay are now deliberately two different actions (2026-08-19, explicit
// user ask — every stray tap used to jump straight to the profile page,
// which read as broken rather than intentional): a plain tap on the photo
// (drag distance under CLICK_THRESHOLD) opens PhotoLightbox in place, while
// only the name/info overlay at the bottom (its own onClick, see below)
// navigates to the full profile detail screen
// (`/app/profils/[userId]`) — one clear, visible target for "go to
// profile" instead of the whole card being a trap door. Action buttons and
// the photo carousel's tap zones stopPropagation their pointerdown (not
// just their click) so tapping them doesn't also register as a drag/tap on
// the photo underneath — a plain onClick stopPropagation isn't enough here
// since the parent listens on pointerdown/up, a separate event pair
// (2026-08-14 fix: this exact gap made the favorite star unclickable —
// tapping it also fired the parent's tap-to-navigate).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { PhotoCarousel } from '@/components/yeoyo/PhotoCarousel';
import { PhotoLightbox } from '@/components/yeoyo/PhotoLightbox';
import { ProfileInfoSections } from '@/components/yeoyo/ProfileInfoSections';
import type { ProfileCard } from '@/lib/yeoyo/types';
import { useLikePop } from '@/lib/yeoyo/useLikePop';
import { FlashMessageModal } from '@/components/yeoyo/FlashMessageModal';

const SWIPE_THRESHOLD = 90;
const CLICK_THRESHOLD = 6;
// Display copy only — enforced server-side in
// lib/server/contact-requests/quota.ts (FREE_DAILY_CONTACT_REQUEST_LIMIT).
const FREE_DAILY_CONTACT_REQUEST_LIMIT = 10;
// Distance the card flies off-screen before the parent's onLike/onDismiss
// actually fires — reuses the drag transform's own 0.25s transition (see
// the `style` below) instead of layering a competing CSS animation on an
// already carefully-tuned drag-physics element.
const EXIT_DISTANCE = 600;
const EXIT_DURATION_MS = 250;

export function SwipeCard({
  profile,
  onDismiss,
  onLike,
  onFlash,
  onFavorite,
  favoriteBusy,
  busy,
  creditBalance,
  blurred,
  blurredMessage,
}: {
  profile: ProfileCard;
  onDismiss: (userId: string) => void;
  onLike: (userId: string) => void;
  onFlash: (userId: string, message: string) => void;
  onFavorite?: (userId: string) => void;
  favoriteBusy?: boolean;
  busy?: boolean;
  creditBalance: number;
  /** True while a blocking dialog (e.g. LimitReachedModal) sits on top —
   * blurs the photo/info content instead of leaving it visually blank once
   * interaction is disabled underneath (2026-08-29, explicit user report:
   * a plain white card there read as a bug, "l'écran reste tout blanc"). */
  blurred?: boolean;
  /** Label shown under the lock icon while blurred — defaults to "Reviens
   * plus tard" (e.g. the daily contact-request quota gives a more specific
   * "reviens demain" one, 2026-08-30 explicit user ask). No effect unless
   * `blurred` is true. */
  blurredMessage?: string | undefined;
}) {
  const router = useRouter();
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);
  const [showFlashModal, setShowFlashModal] = useState(false);
  // Gate for the mobile action bar's portal — see file header comment.
  const [mounted, setMounted] = useState(false);
  const startXRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const liked = profile.liked ?? false;
  const popping = useLikePop(liked);

  // Flies the card fully off-screen (continuing the same transform/
  // transition the drag gesture already uses) before calling the real
  // onLike/onDismiss — so a swipe-past-threshold or an action-button tap
  // never jump-cuts straight to the next card.
  function flyOff(direction: 1 | -1, after: () => void) {
    setExiting(true);
    setDragX(direction * EXIT_DISTANCE);
    setTimeout(after, EXIT_DURATION_MS);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (busy || exiting) return;
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
      flyOff(1, () => onLike(profile.userId));
    } else if (dragX < -SWIPE_THRESHOLD) {
      flyOff(-1, () => onDismiss(profile.userId));
    } else if (Math.abs(dragX) < CLICK_THRESHOLD) {
      setShowLightbox(true);
      setDragX(0);
    } else {
      setDragX(0);
    }
  }

  const likeOpacity = Math.min(Math.max(dragX / SWIPE_THRESHOLD, 0), 1);
  const passOpacity = Math.min(Math.max(-dragX / SWIPE_THRESHOLD, 0), 1);
  const hasMultiplePhotos = profile.photoUrls.length > 1;

  return (
    <>
      <div className="animate-fade-in-up mx-auto flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-surface md:h-full md:max-h-[680px] md:min-h-[380px]">
        <div
          className="relative touch-pan-y select-none md:flex-1 md:overflow-y-auto"
          style={{
            transform: `translateX(${dragX}px) rotate(${dragX / 20}deg)`,
            transition: dragging ? 'none' : 'transform 0.25s ease',
          }}
        >
          {/* Drag-to-swipe + tap-to-open handlers live on the photo area only
            (2026-08-14 fix) — they used to sit on this whole scrollable
            wrapper, so scrolling down into ProfileInfoSections below (a
            vertical drag with ~0 horizontal movement) was misread as a tap
            and navigated to the profile page. Scoping them to just the
            photo means scrolling the info section is now plain scrolling —
            no click, no navigation.
            2026-08-29 (explicit user reference — a competitor's own
            "locked" card treatment): once blocked, only the PHOTO blurs —
            name/bio/tags below stay fully readable, matching that
            reference instead of blanking the whole card. The lock badge +
            "reviens plus tard" label sit in a sibling `<div>` right after
            this one, deliberately outside the blurred element — a CSS
            `filter` applies to descendants too, so the reassurance message
            would blur along with the photo if it lived inside — so it lives
            in its own non-blurred `relative` wrapper one level up instead,
            sized to the photo by the same "one flow child, rest absolute"
            layout the photo div already relies on. */}
          <div className="relative">
            <div
              className={`relative transition-[filter] duration-200 ${blurred ? 'pointer-events-none blur-md' : ''}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <PhotoCarousel
                photoUrls={profile.photoUrls}
                name={profile.firstName}
                heightPx={340}
                onIndexChange={setPhotoIndex}
              />
              {profile.boosted && (
                <div
                  className={`absolute left-3 flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 ${hasMultiplePhotos ? 'top-6' : 'top-3'}`}
                >
                  <Icon name="zap" size={12} className="text-primary-foreground" />
                  <span className="font-body text-xs font-bold text-primary-foreground">
                    En avant
                  </span>
                </div>
              )}
              {onFavorite && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
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
              <div
                role="button"
                tabIndex={0}
                aria-label={`Voir le profil de ${profile.firstName}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => router.push(`/app/profils/${profile.userId}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(`/app/profils/${profile.userId}`);
                  }
                }}
                className="absolute inset-x-0 bottom-0 cursor-pointer bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-3 pt-14"
              >
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
                  {/* Signals this row (unlike the photo above it) is the tap
                    target that leaves the deck for the profile page. */}
                  <Icon
                    name="chevron-right"
                    size={16}
                    className="ml-auto flex-shrink-0 text-white/60"
                  />
                </div>
                {(profile.city || profile.commune) && (
                  <div className="mt-1 flex items-center gap-1 text-white/80">
                    <Icon name="map-pin" size={13} />
                    <span className="font-body text-sm">
                      {[profile.city, profile.commune].filter(Boolean).join(', ')}
                    </span>
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
              {/* Scroll hint — there's always more below the photo
              (ProfileInfoSections + action bar), so this is unconditional,
              not gated on content length. `pointer-events-none` so it never
              intercepts the drag/tap gesture layered underneath. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center">
                <Icon name="chevron-down" size={16} className="scroll-hint text-white/70" />
              </div>
            </div>

            {blurred && (
              <div className="animate-fade-in pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface/95 text-primary shadow-lg">
                  <Icon name="lock" size={24} />
                </span>
                <p className="rounded-full bg-surface/95 px-4 py-1.5 font-body text-sm font-semibold text-foreground shadow-lg">
                  {blurredMessage ?? 'Reviens plus tard'}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 p-4">
            <ProfileInfoSections
              profile={profile}
              onPhotoClick={(index) => {
                setPhotoIndex(index);
                setShowLightbox(true);
              }}
            />
          </div>
        </div>

        {/* Desktop only — the mobile version renders via a portal below (see
          file header comment for why). Same buttons, in-flow footer glued
          to the card's own bottom edge, unchanged from before. */}
        <div
          className="hidden flex-shrink-0 items-center justify-center gap-4 border-t border-border bg-surface px-4 py-3 md:flex"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {renderActions()}
        </div>

        {showLightbox && (
          <PhotoLightbox
            photoUrl={profile.photoUrls[photoIndex] ?? profile.photoUrls[0] ?? null}
            name={profile.firstName}
            onClose={() => setShowLightbox(false)}
          />
        )}
        <FlashMessageModal
          open={showFlashModal}
          onClose={() => setShowFlashModal(false)}
          balance={creditBalance}
          onSend={(message) => {
            setShowFlashModal(false);
            flyOff(1, () => onFlash(profile.userId, message));
          }}
        />
      </div>
      {/* Mobile only — floating above MobileTabBar's "Accueil" bar, via a
        portal straight onto document.body so no ancestor transform (the
        drag wrapper above, or this card's own entrance animation) can turn
        it into a non-viewport-relative fixed element (see file header
        comment). `md:hidden` keeps desktop on its proven in-flow footer. */}
      {mounted &&
        createPortal(
          <div
            className="fixed inset-x-0 bottom-16 z-40 flex justify-center px-5 pb-3 pt-2 md:hidden"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex w-full max-w-sm items-center justify-center gap-4">
              {renderActions()}
            </div>
          </div>,
          document.body,
        )}
    </>
  );

  // Circular Passer + pill Demander (2026-08-19, modeled on the Banani
  // DiscoverScreen.jsx design; the Message shortcut was removed 2026-08-25 —
  // messaging only opened once a contact request was accepted). Message
  // Flash (2026-08-27) reintroduces a middle button, but it does NOT open
  // messaging directly — it opens FlashMessageModal to attach a paid
  // message to the contact request itself; the underlying accepted-only
  // messaging flow is unchanged. Shared between the desktop in-flow footer
  // above and the mobile floating portal below so both stay visually
  // identical.
  function renderActions(): ReactNode {
    return (
      <>
        <button
          type="button"
          onClick={() => flyOff(-1, () => onDismiss(profile.userId))}
          disabled={busy || exiting}
          aria-label="Passer ce profil"
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border-2 border-red-200 bg-red-50 shadow-md transition-transform active:scale-95 disabled:opacity-50"
        >
          <Icon name="x" size={22} className="text-primary" />
        </button>
        <button
          type="button"
          onClick={() => setShowFlashModal(true)}
          disabled={busy || liked || exiting}
          aria-label="Message flash — envoyer un message avant que ta demande soit acceptée"
          className="btn-premium flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full shadow-md transition-transform active:scale-95 disabled:opacity-50"
        >
          <Icon name="zap" size={20} />
        </button>
        <button
          type="button"
          onClick={() => flyOff(1, () => onLike(profile.userId))}
          disabled={busy || liked || exiting}
          aria-label={`Demander — ${FREE_DAILY_CONTACT_REQUEST_LIMIT} demandes gratuites par jour`}
          className={`btn-success-flash relative flex h-14 flex-shrink-0 items-center gap-2 rounded-full px-6 font-body text-sm font-bold shadow-md shadow-secondary/25 transition-colors ${busy ? 'opacity-50' : ''} ${liked ? 'bg-secondary/70 text-secondary-foreground' : 'bg-secondary text-secondary-foreground'}`}
        >
          {busy ? (
            <Icon name="refresh-cw" size={16} className="flex-shrink-0 animate-spin" />
          ) : (
            <Icon
              name="plus"
              size={18}
              className={`flex-shrink-0 ${popping ? 'animate-heart-pop' : ''}`}
            />
          )}
          <span className="leading-none">{liked ? 'Envoyée' : 'Demander'}</span>
        </button>
      </>
    );
  }
}
