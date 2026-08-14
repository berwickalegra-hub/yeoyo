import Link from 'next/link';
import { BrandMark } from './BrandMark';

// Rebuilt for the "Rencontres Sérieuses Congo" Banani landing redesign
// (2026-08-13, landing-nouveau-theme-2.md) — different link set (Accueil/
// Comment ça marche/Tarifs/FAQ/Contact) and a single "Se connecter" CTA
// (no dual login+"Rejoindre" pair). Only used by the landing page
// (`app/page.tsx`) — AuthShell.tsx has its own inline logo, unaffected.
// "Comment ça marche" and "Tarifs" have real in-page anchors; "FAQ" and
// "Contact" have no matching section in this screen (same "inert label"
// precedent as the prior landing redesign's "À propos") — plain
// non-interactive text rather than a dead href.
const NAV_LINKS = [
  { label: 'Comment ça marche', href: '#comment-ca-marche' },
  { label: 'Tarifs', href: '#tarifs' },
];
const INERT_LABELS = ['FAQ', 'Contact'];

export function YeOyoNav() {
  return (
    <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-5 py-4 lg:px-10 lg:py-5">
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
        {INERT_LABELS.map((label) => (
          <span key={label} className="font-body text-sm text-muted-foreground/60">
            {label}
          </span>
        ))}
      </div>

      <Link
        href="/login"
        className="rounded-xl border border-primary px-4 py-1.5 font-body text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground active:scale-[0.98] lg:px-6 lg:py-2 lg:text-base"
      >
        Se connecter
      </Link>
    </nav>
  );
}
