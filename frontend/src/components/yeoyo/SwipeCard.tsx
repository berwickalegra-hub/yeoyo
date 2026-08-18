'use client';

// Single-profile swipe card — Découvrir/Explorer's centered, mobile-first
// card (redesigned 2026-08-07, then again 2026-08-10 after a reference
// dating app screenshot showing a fixed card frame: the title bar and the
// 3-button action row never move, only the photo + info scroll *inside*
// the card). The photo+info wrapper is `flex-1 overflow-y-auto` — the only
// part that scrolls.
//
// Height (2026-08-19): `h-full` instead of a hardcoded `100dvh` calc — the
// card now lives inside explorer/page.tsx's own non-scrolling, height-
// bounded flex container, which is the single source of truth for how much
// vertical space is actually available. The old calc()'d a fixed number of
// rem for "everything else on screen" (nav bars, page title, filter row);
// when that chrome changed size, the math silently went stale and the card
// + its own internal scroll region no longer matched the real viewport,
// producing a second, competing page-level scrollbar (explicit user
// report). `h-full` can't go stale the same way — it just fills whatever
// its parent actually gives it.
//
// Action row is a normal (non-`position: fixed`) `flex-shrink-0` footer,
// last child of the card's own flex column (2026-08-14, reverted a same-day
// `position: fixed`-to-viewport experiment after explicit user report: fixed
// positioning made the bar cover the info section instead of sitting glued
// to the card's own bottom edge, and drifted relative to the card on wider
// (desktop) layouts where the card isn't screen-width). Because the outer
// card is `overflow-hidden` with an explicit height
// (`h-[calc(100dvh-13rem)]`/`md:h-[640px]`), the footer never needs
// viewport-relative positioning to stay put — it's simply never part of the
// scrollable region above it. Identical behavior on mobile and web; no
// breakpoint-specific offsets.
//
// Multi-photo carousel (2026-08-10): PhotoCarousel renders a WhatsApp
// status-style segmented bar + left/right tap zones when a profile has more
// than one photo — see components/yeoyo/PhotoCarousel.tsx.
//
// Horizontal drag (mouse or touch, via the Pointer Events API) on the
// photo/info section mirrors the action row: drag right past the threshold
// = Aimer, left = Passer. A plain tap (drag distance under CLICK_THRESHOLD)
// opens the full profile detail screen (`/app/profils/[userId]`) — same
// destination as tapping the name overlay directly. Action buttons and the
// photo carousel's tap zones stopPropagation their pointerdown (not just
// their click) so tapping them doesn't also register as a drag/tap on the
// photo underneath — a plain onClick stopPropagation isn't enough here
// since the parent listens on pointerdown/up, a separate event pair
// (2026-08-14 fix: this exact gap made the favorite star unclickable —
// tapping it also fired the parent's tap-to-navigate).
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { PhotoCarousel } from '@/components/yeoyo/PhotoCarousel';
import { ProfileInfoSections } from '@/components/yeoyo/ProfileInfoSections';
import { PremiumGateModal } from '@/components/yeoyo/PremiumGateModal';
import type { ProfileCard } from '@/lib/yeoyo/types';
import { useLikePop } from '@/lib/yeoyo/useLikePop';
import { usePremium } from '@/contexts/PremiumContext';

const SWIPE_THRESHOLD = 90;
const CLICK_THRESHOLD = 6;
// Display copy only — the real limit is enforced server-side in
// lib/server/conversations/flash-message-quota.ts (FREE_FLASH_MESSAGE_LIMIT).
// Kept in sync manually since that file is `server-only` and can't be
// imported into this client component.
const FREE_FLASH_MESSAGE_LIMIT = 3;
// Display copy only — enforced server-side in
// lib/server/contact-requests/quota.ts (FREE_MONTHLY_CONTACT_REQUEST_LIMIT).
const FREE_MONTHLY_CONTACT_REQUEST_LIMIT = 5;
// Distance the card flies off-screen before the parent's onLike/onDismiss
// actually fires — reuses the drag transform's own 0.25s transition (see
// the `style` below) instead of layering a competing CSS animation on an
// already carefully-tuned drag-physics element.
const EXIT_DISTANCE = 600;
const EXIT_DURATION_MS = 250;

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
  const { isPremium } = usePremium();
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [messageQuotaBusy, setMessageQuotaBusy] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const startXRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);

  const liked = profile.liked ?? false;
  const popping = useLikePop(liked);

  // Message is gold-styled as a Premium-flavored action (2026-08-17,
  // explicit user ask): non-Premium users get FREE_FLASH_MESSAGE_LIMIT free
  // uses (checked+consumed atomically server-side, see
  // /api/profile/flash-message-quota), then PremiumGateModal instead of a
  // hard redirect — the lock badge stays visible regardless of remaining
  // quota (it signals "Premium-flavored", not "currently blocked").
  async function handleMessageTap() {
    if (isPremium) {
      onMessage(profile.userId);
      return;
    }
    setMessageQuotaBusy(true);
    try {
      const result = await api<{ allowed: boolean }>('/api/profile/flash-message-quota', {
        method: 'POST',
      });
      if (result.allowed) {
        onMessage(profile.userId);
      } else {
        setShowPremiumModal(true);
      }
    } catch {
      setShowPremiumModal(true);
    } finally {
      setMessageQuotaBusy(false);
    }
  }

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
      router.push(`/app/profils/${profile.userId}`);
      setDragX(0);
    } else {
      setDragX(0);
    }
  }

  const likeOpacity = Math.min(Math.max(dragX / SWIPE_THRESHOLD, 0), 1);
  const passOpacity = Math.min(Math.max(-dragX / SWIPE_THRESHOLD, 0), 1);
  const hasMultiplePhotos = profile.photoUrls.length > 1;

  return (
    <div className="animate-fade-in-up mx-auto flex h-full max-h-[680px] min-h-[380px] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-surface md:h-[640px]">
      <div
        className="relative flex-1 touch-pan-y select-none overflow-y-auto"
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
            no click, no navigation. */}
        <div
          className="relative"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <PhotoCarousel photoUrls={profile.photoUrls} name={profile.firstName} heightPx={340} />
          {profile.boosted && (
            <div
              className={`absolute left-3 flex items-center gap-1 rounded-xl bg-gold px-2.5 py-1 ${hasMultiplePhotos ? 'top-6' : 'top-3'}`}
            >
              <Icon name="zap" size={11} className="text-gold-foreground" />
              <span className="font-body text-xs font-semibold text-gold-foreground">En avant</span>
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
              {profile.isPremium && (
                <span className="flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5">
                  <Icon name="crown" size={12} className="text-gold" />
                  <span className="font-body text-xs font-medium text-white">Premium</span>
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
          {/* Scroll hint — there's always more below the photo
              (ProfileInfoSections + action bar), so this is unconditional,
              not gated on content length. `pointer-events-none` so it never
              intercepts the drag/tap gesture layered underneath. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center">
            <Icon name="chevron-down" size={16} className="scroll-hint text-white/70" />
          </div>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <ProfileInfoSections profile={profile} />
        </div>
      </div>

      {/* Action bar — glued to the card's own bottom edge as a normal
          flex-shrink-0 footer (not position:fixed to the viewport, see file
          header comment).
          Balanced 3-up layout (2026-08-17): equal flex-1 pills, each h-14
          with identical icon/text gap and padding so the three stay visually
          consistent. Colors: muted/desaturated red for Passer (reject —
          softer than a stock red-500, same red-200/red-700 pairing already
          used for error states elsewhere, e.g. ToastContext's error toast),
          gold for Message (Premium-flavored per the lock badge below —
          gold's other use app-wide is Premium status, and here it signals
          "extended for Premium" specifically, not a plain brand action),
          forest green for Demander (kept the boldest label of the three so
          it still reads as the recommended action without being wider). */}
      <div
        className="flex flex-shrink-0 items-center justify-center gap-3 border-t border-border bg-surface px-4 py-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => flyOff(-1, () => onDismiss(profile.userId))}
          disabled={busy || exiting}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-red-200 px-3 font-body text-sm font-semibold text-red-700 transition-transform active:scale-95 disabled:opacity-50"
          aria-label="Passer ce profil"
        >
          <Icon name="x" size={18} className="flex-shrink-0" />
          <span className="leading-none">Passer</span>
        </button>
        <button
          type="button"
          onClick={() => void handleMessageTap()}
          disabled={busy || messageQuotaBusy}
          aria-label={
            isPremium ? 'Envoyer un message' : 'Messagerie Premium — passer Premium pour débloquer'
          }
          className="relative flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-gold px-3 font-body text-sm font-semibold text-gold-foreground transition-transform active:scale-95 disabled:opacity-50"
        >
          {busy || messageQuotaBusy ? (
            <Icon name="refresh-cw" size={16} className="flex-shrink-0 animate-spin" />
          ) : (
            <Icon name="message-circle" size={18} className="flex-shrink-0" />
          )}
          <span className="leading-none">Message</span>
          {!isPremium && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold-foreground shadow">
              <Icon name="lock" size={11} className="text-gold" />
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => flyOff(1, () => onLike(profile.userId))}
          disabled={busy || liked || exiting}
          aria-label={
            isPremium
              ? 'Demander'
              : `Demander — ${FREE_MONTHLY_CONTACT_REQUEST_LIMIT} demandes gratuites par mois`
          }
          className={`btn-success-flash relative flex h-14 flex-1 items-center justify-center gap-2 rounded-full px-3 font-body text-sm font-bold shadow-md shadow-secondary/25 transition-colors ${busy ? 'opacity-50' : ''} ${liked ? 'bg-secondary/70 text-secondary-foreground' : 'bg-secondary text-secondary-foreground'}`}
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
          {/* Freemium hint (2026-08-19, explicit user ask) — mirrors the
              Message button's lock badge above: contact requests are also
              capped for free users (5/mois, contact-requests/quota.ts), this
              button just never surfaced that anywhere. */}
          {!isPremium && !liked && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold shadow">
              <Icon name="crown" size={11} className="text-gold-foreground" fill="currentColor" />
            </span>
          )}
        </button>
      </div>

      <PremiumGateModal
        open={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        title="Fonctionnalité Premium"
        description={`Le Message te permet d'envoyer un message avant même que ta demande soit acceptée. Tu as utilisé tes ${FREE_FLASH_MESSAGE_LIMIT} messages gratuits — passe Premium pour continuer.`}
      />
    </div>
  );
}
