'use client';

// Scroll-triggered fade/rise-in for long-form content pages (2026-08-19,
// explicit user ask: "landing page... on veut d'en découvrir plus au
// changement de widget, de texte"). One-shot — never re-hides on scroll
// back up, since re-triggering on every scroll direction reads as gimmicky
// rather than professional. The CSS in globals.css (`.reveal` /
// `.reveal.is-visible`) owns the transition and its own
// prefers-reduced-motion override, so this component never has to branch on
// the media query itself.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Reveal({
  children,
  delayMs = 0,
  className = '',
}: {
  children: ReactNode;
  /** Stagger offset for grids/lists — pass `i * 80` from a `.map()` index. */
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Fires once the element is ~15% visible, slightly before it reaches
    // the very bottom of the viewport, so the reveal feels timed to the
    // scroll rather than lagging behind it.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -80px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
