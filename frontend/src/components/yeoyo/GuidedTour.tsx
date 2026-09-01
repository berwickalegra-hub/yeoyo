'use client';

import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import type { TourStep } from '@/lib/yeoyo/guided-tour';

// First-visit walkthrough. Dims the screen, cuts a "spotlight" hole around a
// real nav button (matched by `[data-tour="<id>"]`, whichever copy is
// currently visible — TopNav on desktop, MobileTabBar on mobile), and floats
// an explainer card next to it. Steps with no `target` render a centered
// card (welcome / closing).
//
// Pure explainer: the highlighted control isn't clickable through the
// overlay — "Suivant" / "Précédent" drive it, "Passer" / backdrop / Échap
// / the ✕ all close it. No external libraries.

const SPOTLIGHT_PADDING = 10;
const CARD_GAP = 14;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findVisibleTarget(target: string | undefined): HTMLElement | null {
  if (!target || typeof document === 'undefined') return null;
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  return (
    els.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) ?? null
  );
}

export function GuidedTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  useEffect(() => setMounted(true), []);

  const step = steps[index];
  const isLast = index >= steps.length - 1;

  const next = useCallback(() => {
    setIndex((n) => {
      if (n >= steps.length - 1) {
        onClose();
        return n;
      }
      return n + 1;
    });
  }, [steps.length, onClose]);

  const prev = useCallback(() => setIndex((n) => Math.max(0, n - 1)), []);

  // Measure the current target (and re-measure on resize / scroll / layout
  // settle so the spotlight tracks it).
  useLayoutEffect(() => {
    if (!mounted) return;
    let raf = 0;
    const measure = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      const el = findVisibleTarget(step?.target);
      if (!el) {
        setBox(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    const settle = window.setTimeout(measure, 180);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
      window.clearTimeout(settle);
      cancelAnimationFrame(raf);
    };
  }, [mounted, step?.target, index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  if (!mounted || !step) return null;

  const spot: Box | null = box
    ? {
        top: box.top - SPOTLIGHT_PADDING,
        left: box.left - SPOTLIGHT_PADDING,
        width: box.width + SPOTLIGHT_PADDING * 2,
        height: box.height + SPOTLIGHT_PADDING * 2,
      }
    : null;

  // Card sits below the target, or above it when the target is in the lower
  // half of the screen (the mobile bottom bar), or dead-centre with no target.
  const placeAbove = spot ? spot.top + spot.height / 2 > viewport.h / 2 : false;
  const cardStyle: CSSProperties = spot
    ? placeAbove
      ? { bottom: viewport.h - spot.top + CARD_GAP, left: '50%', transform: 'translateX(-50%)' }
      : { top: spot.top + spot.height + CARD_GAP, left: '50%', transform: 'translateX(-50%)' }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label="Visite guidée"
    >
      {/* Backdrop — blocks interaction with the app behind. Deliberately NOT
          click-to-dismiss: the tour is a one-time first-run explainer and the
          "seen" flag is set on close, so an accidental tap shouldn't end it.
          Close via "Passer" / the ✕ / Échap. When a target is spotlighted the
          dim comes from that element's huge box-shadow (leaving a clear hole),
          so this layer is transparent then. */}
      <div aria-hidden className={`absolute inset-0 ${spot ? '' : 'bg-black/70'}`} />

      {spot && (
        <div
          aria-hidden
          className="pointer-events-none absolute transition-all duration-300 ease-out"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            borderRadius: 16,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.7)',
            outline: '2px solid rgba(255,255,255,0.9)',
          }}
        />
      )}

      <div
        className="animate-scale-in absolute w-[min(360px,calc(100vw-32px))] rounded-2xl border border-border bg-surface p-5 shadow-2xl"
        style={cardStyle}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
        >
          <Icon name="x" size={16} />
        </button>

        <p className="pr-6 font-headings text-base font-bold text-foreground">{step.title}</p>
        <p className="mt-1.5 font-body text-sm leading-relaxed text-muted-foreground">
          {step.body}
        </p>

        <div className="mt-4 flex items-center justify-center gap-1.5">
          {steps.map((_, dot) => (
            <span
              key={dot}
              className={`h-1.5 rounded-full transition-all ${
                dot === index ? 'w-4 bg-primary' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          {index === 0 ? (
            <button
              type="button"
              onClick={onClose}
              className="font-body text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Passer
            </button>
          ) : (
            <button
              type="button"
              onClick={prev}
              className="flex items-center gap-1 font-body text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon name="chevron-left" size={15} />
              Précédent
            </button>
          )}

          <button
            type="button"
            onClick={next}
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 font-body text-sm font-semibold text-primary-foreground transition-transform active:scale-95"
          >
            {isLast ? 'Terminer' : 'Suivant'}
            {!isLast && <Icon name="chevron-right" size={15} />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
