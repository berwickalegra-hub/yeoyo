'use client';

import { useCallback, useState } from 'react';

// Drives a swipe-out exit animation before a card actually leaves the list
// — same transient-state-then-clear shape as useLikePop. `trigger(direction,
// commit)` adds the matching `.animate-slide-out-{direction}` class
// immediately and calls `commit` (the real dismiss/like handler) only after
// the CSS transition has had time to play, so the card is never yanked out
// of the DOM mid-animation.
const EXIT_DURATION_MS = 250;

export type ExitDirection = 'left' | 'right';

export function useCardExit(): {
  exiting: ExitDirection | null;
  exitClassName: string;
  trigger: (direction: ExitDirection, commit: () => void) => void;
} {
  const [exiting, setExiting] = useState<ExitDirection | null>(null);

  const trigger = useCallback((direction: ExitDirection, commit: () => void) => {
    setExiting(direction);
    setTimeout(() => {
      commit();
      setExiting(null);
    }, EXIT_DURATION_MS);
  }, []);

  const exitClassName = exiting ? `animate-slide-out-${exiting}` : '';

  return { exiting, exitClassName, trigger };
}
