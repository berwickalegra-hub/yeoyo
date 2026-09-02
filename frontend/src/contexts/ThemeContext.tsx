'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Color templates the user can pick from Paramètres → Apparence. Each swaps
// the same set of CSS custom properties (defined in globals.css under
// `[data-theme="…"]`) — the `@theme` block's default values ARE the default
// "rose" romantic palette (2026-09-02 user request). Its theme id stays
// 'terracotta' so previously-stored preferences still resolve to the default;
// only the palette behind that id changed.
export const THEMES = [
  {
    id: 'terracotta',
    label: 'Rose & Romantique',
    description: "L'apparence par défaut de YeOyo.",
    swatch: { background: '#fff6f8', primary: '#d63c6d', surface: '#ffffff' },
  },
  {
    id: 'light-blue',
    label: 'Clair & Bleu',
    description: "L'ancienne apparence par défaut de YeOyo.",
    swatch: { background: '#fafaf9', primary: '#277eff', surface: '#ffffff' },
  },
  {
    id: 'dark-gold',
    label: 'Sombre & Or',
    description: "L'ancienne apparence par défaut de YeOyo.",
    swatch: { background: '#0d0d0d', primary: '#c9a84c', surface: '#161616' },
  },
  {
    id: 'light',
    label: 'Clair & Or',
    description: 'Fond clair, accent or.',
    swatch: { background: '#faf8f2', primary: '#b8862f', surface: '#ffffff' },
  },
  {
    id: 'light-purple',
    label: 'Clair & Violet',
    description: 'Même thème clair, accent violet.',
    swatch: { background: '#fafaf9', primary: '#7c3aed', surface: '#ffffff' },
  },
  {
    id: 'light-emerald',
    label: 'Clair & Émeraude',
    description: 'Même thème clair, accent émeraude.',
    swatch: { background: '#fafaf9', primary: '#059669', surface: '#ffffff' },
  },
  {
    id: 'light-rose',
    label: 'Rose vif & fond neutre',
    description: 'Rose plus vif, fond blanc froid (sans la nuance blush).',
    swatch: { background: '#fafaf9', primary: '#e11d6f', surface: '#ffffff' },
  },
  {
    id: 'dark-rose',
    label: 'Sombre & Rose',
    description: 'Thème sombre, accent rose.',
    swatch: { background: '#0d0d0d', primary: '#d1668a', surface: '#161616' },
  },
  {
    id: 'dark-emerald',
    label: 'Sombre & Émeraude',
    description: 'Thème sombre, accent émeraude.',
    swatch: { background: '#0d0d0d', primary: '#3fae74', surface: '#161616' },
  },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const STORAGE_KEY = 'yeoyo-theme';
const DEFAULT_THEME: ThemeId = 'terracotta';

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
