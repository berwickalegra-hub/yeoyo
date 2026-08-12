'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Color templates the user can pick from Paramètres → Apparence. Each swaps
// the same set of CSS custom properties (defined in globals.css under
// `[data-theme="…"]`) — the `@theme` block's default values ARE the
// 'dark-gold' template, so no override is needed for it.
export const THEMES = [
  {
    id: 'dark-gold',
    label: 'Sombre & Or',
    description: "L'apparence par défaut de YeOyo.",
    swatch: { background: '#0d0d0d', primary: '#c9a84c', surface: '#161616' },
  },
  {
    id: 'light',
    label: 'Clair',
    description: 'Fond clair, meilleure lisibilité en plein jour.',
    swatch: { background: '#faf8f2', primary: '#b8862f', surface: '#ffffff' },
  },
  {
    id: 'dark-rose',
    label: 'Sombre & Rose',
    description: 'Même thème sombre, accent rose.',
    swatch: { background: '#0d0d0d', primary: '#d1668a', surface: '#161616' },
  },
  {
    id: 'dark-emerald',
    label: 'Sombre & Émeraude',
    description: 'Même thème sombre, accent émeraude.',
    swatch: { background: '#0d0d0d', primary: '#3fae74', surface: '#161616' },
  },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const STORAGE_KEY = 'yeoyo-theme';
const DEFAULT_THEME: ThemeId = 'dark-gold';

function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

function applyTheme(id: ThemeId): void {
  if (id === DEFAULT_THEME) {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', id);
  }
}

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  // The blocking inline script in layout.tsx already applied the stored
  // theme to the DOM before paint (avoids a flash) — this just syncs React
  // state to match on mount so the picker page highlights the right card.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isThemeId(stored)) setThemeState(stored);
  }, []);

  function setTheme(id: ThemeId): void {
    setThemeState(id);
    window.localStorage.setItem(STORAGE_KEY, id);
    applyTheme(id);
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
