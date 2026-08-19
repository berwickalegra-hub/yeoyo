'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { BrandMark } from './BrandMark';

// Rebuilt for the "Rencontres Sérieuses Congo" Banani landing redesign
// (2026-08-13, landing-nouveau-theme-2.md) — different link set (Accueil/
// Comment ça marche/Tarifs/FAQ/Contact) and a single "Se connecter" CTA
// (no dual login+"Rejoindre" pair). Only used by the landing page
// (`app/page.tsx`) — AuthShell.tsx has its own inline logo, unaffected.
// "Comment ça marche", "Tarifs" and "FAQ" have real in-page anchors;
// "Contact" scrolls to the footer, which carries the real contact email —
// no dedicated contact section/form exists, so a fabricated one would be
// dishonest chrome (2026-08-19: promoted from a dead grey label to a real
// anchor once the FAQ section shipped).
const NAV_LINKS = [
  { label: 'Comment ça marche', href: '#comment-ca-marche' },
  { label: 'Tarifs', href: '#tarifs' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#site-footer' },
];

// 'use client' + local open state only for the mobile menu toggle — the
// desktop nav below stays server-renderable markup, this is additive.
export function YeOyoNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-30 border-b border-border bg-surface px-5 py-4 lg:px-10 lg:py-5">
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 lg:gap-3">
          <BrandMark className="h-8 w-auto lg:h-10" />
          <span className="font-headings text-base font-bold tracking-tight text-foreground lg:text-lg">
            YeOyo
          </span>
        </Link>

        <div className="hidden items-center gap-8 lg:flex">
          <Link
            href="/"
            className="font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Accueil
          </Link>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-xl border border-primary px-4 py-1.5 font-body text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground active:scale-[0.98] lg:px-6 lg:py-2 lg:text-base"
          >
            Se connecter
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground lg:hidden"
          >
            <Icon name={mobileOpen ? 'x' : 'menu'} size={22} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="animate-fade-in-down mt-4 flex flex-col gap-1 border-t border-border pt-4 lg:hidden">
          <a
            href="/"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg px-2 py-2.5 font-body text-sm text-foreground hover:bg-muted"
          >
            Accueil
          </a>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-2 py-2.5 font-body text-sm text-foreground hover:bg-muted"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
