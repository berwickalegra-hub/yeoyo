'use client';

import { useEffect, useRef, useState } from 'react';

// Drives the .animate-heart-pop bounce for exactly one cycle right after a
// like succeeds — not on mount, so a profile that was already liked in a
// previous session doesn't replay the animation every time its card renders.
export function useLikePop(liked: boolean): boolean {
  const prevLikedRef = useRef(liked);
  const [popping, setPopping] = useState(false);

  useEffect(() => {
    const justLiked = liked && !prevLikedRef.current;
    prevLikedRef.current = liked;
    if (!justLiked) {
      setPopping(false);
      return undefined;
    }
    setPopping(true);
    const timer = setTimeout(() => setPopping(false), 300);
    return () => clearTimeout(timer);
  }, [liked]);

  return popping;
}
