import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TOUR_STEPS, TOUR_STORAGE_KEY, hasSeenTour, markTourSeen, resetTour } from './guided-tour';

// Minimal localStorage stand-in (the test env is `node`, no `window`).
function installStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('guided-tour flag helpers', () => {
  beforeEach(() => {
    installStorage();
  });

  it('starts unseen, then persists a "seen" marker under the versioned key', () => {
    expect(hasSeenTour()).toBe(false);
    markTourSeen();
    expect(hasSeenTour()).toBe(true);
  });

  it('resetTour clears the marker so the tour shows again', () => {
    markTourSeen();
    resetTour();
    expect(hasSeenTour()).toBe(false);
  });

  it('treats storage failure as "seen" (never traps the user in a tour)', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError: storage disabled');
        },
      },
    });
    expect(hasSeenTour()).toBe(true);
  });
});

describe('TOUR_STEPS content', () => {
  it('bookends targetless cards around the 5 targeted nav stops', () => {
    expect(TOUR_STEPS[0]?.target).toBeUndefined();
    expect(TOUR_STEPS[TOUR_STEPS.length - 1]?.target).toBeUndefined();
    const targets = TOUR_STEPS.filter((s) => s.target).map((s) => s.target);
    expect(targets).toEqual(['accueil', 'decouvrir', 'demandes', 'messages', 'compte']);
  });

  it('every step has a non-empty title and body', () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });

  it('exposes a stable storage key', () => {
    expect(TOUR_STORAGE_KEY).toBe('yeoyo.tour.v1');
  });
});
