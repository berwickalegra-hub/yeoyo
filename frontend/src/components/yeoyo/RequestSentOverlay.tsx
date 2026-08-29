'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '@/components/ui/Icon';

const DISPLAY_DURATION = 1400;

// Center-screen, self-dismissing confirmation (2026-08-28, explicit user
// ask: "un message au milieu au centre" on every Demander/like tap, like
// other dating apps do). 2026-08-29: generalized beyond "Demande envoyée !"
// — explicit user ask that EVERY brief confirmation on Découvrir use this
// exact same visual treatment (like, favori ajouté/retiré, message flash
// envoyé) instead of some going through the top toast pill and others
// through this overlay. Callers pick icon/title/subtitle; the shell (timing,
// portal, animation) stays identical everywhere so the app reads as one
// consistent notification language. Deliberately lighter than MatchModal —
// a passive acknowledgement with no buttons, not a "you matched" moment
// that needs a choice; see LimitReachedModal for the other half of this
// system — messages that DO need the user to act before they go away.
// Portals to document.body for the same reason as Sheet.tsx/
// PhotoLightbox.tsx: callers (SwipeCard, ProfileGridCard) sit under
// transformed ancestors that would otherwise trap a fixed overlay.
// `pointer-events-none` on the backdrop so the brief auto-dismiss never
// blocks a tap underneath.
export function RequestSentOverlay({
  show,
  onDone,
  icon = 'heart',
  title = 'Demande envoyée !',
  subtitle = 'On te préviendra si elle ou il accepte.',
}: {
  show: boolean;
  onDone: () => void;
  icon?: IconName | undefined;
  title?: string | undefined;
  subtitle?: string | undefined;
}) {
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
          <Icon
            name={icon}
            size={30}
            {...(icon === 'heart' || icon === 'star' ? { fill: 'currentColor' } : {})}
          />
        </span>
        <p className="font-headings text-lg font-bold text-foreground">{title}</p>
        {subtitle && <p className="font-body text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>,
    document.body,
  );
}
