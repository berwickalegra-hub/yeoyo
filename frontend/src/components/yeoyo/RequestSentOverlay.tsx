'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';

const DISPLAY_DURATION = 1400;

// Center-screen "your request was sent" confirmation (2026-08-28, explicit
// user ask: "un message au milieu au centre" on every Demander/like tap,
// like other dating apps do). Deliberately lighter than MatchModal.tsx — a
// passive, self-dismissing acknowledgement with no buttons, not the "you
// matched" moment that needs a choice. Portals to document.body for the
// same reason as Sheet.tsx/PhotoLightbox.tsx: callers (SwipeCard,
// ProfileGridCard) sit under transformed ancestors that would otherwise
// trap a fixed overlay. `pointer-events-none` on the backdrop so the brief
// auto-dismiss never blocks a tap underneath.
export function RequestSentOverlay({ show, onDone }: { show: boolean; onDone: () => void }) {
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(onDone, DISPLAY_DURATION);
    return () => clearTimeout(timer);
  }, [show, onDone]);

  if (!show) return null;

  return createPortal(
    <div
      className="animate-fade-in pointer-events-none fixed inset-0 z-[110] flex items-center justify-center bg-black/30"
      role="status"
      aria-live="polite"
    >
      <div className="animate-scale-in flex flex-col items-center gap-3 rounded-3xl bg-surface px-8 py-7 text-center shadow-2xl">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Icon name="heart" size={30} fill="currentColor" />
        </span>
        <p className="font-headings text-lg font-bold text-foreground">Demande envoyée !</p>
        <p className="font-body text-sm text-muted-foreground">
          On te préviendra si elle ou il accepte.
        </p>
      </div>
    </div>,
    document.body,
  );
}
