import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

const DESKTOP_LINKS = [
  { label: 'Accueil', href: '/' },
  { label: 'Télécharger', href: '/telecharger' },
  { label: 'Blog', href: '/blog' },
];

export function YeOyoNav() {
  return (
    <nav className="flex items-center justify-between border-b border-border bg-background px-5 py-4 lg:px-10 lg:py-5">
      <Link href="/" className="flex items-center gap-2 lg:gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary lg:h-10 lg:w-10">
          <span className="font-headings text-sm font-bold text-primary-foreground lg:text-base">
            Y
          </span>
        </div>
        <span className="font-headings text-base font-bold tracking-tight text-foreground lg:text-lg">
          YeOyo
        </span>
      </Link>

      <div className="hidden items-center gap-8 lg:flex">
        {DESKTOP_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2 lg:gap-3">
        {/* Existing-member entry point: icon-only on mobile to save header
            space (a bottom-sheet nav has no room for two text CTAs), full
            "Se connecter" label from `lg` up next to "Rejoindre". */}
        <Link
          href="/login"
          aria-label="Se connecter"
          title="Se connecter"
          className="flex items-center gap-2 rounded-xl border border-border p-2 font-body text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary lg:px-4 lg:py-2"
        >
          <Icon name="log-in" size={18} />
          <span className="hidden lg:inline">Se connecter</span>
        </Link>
        <Link
          href="/onboarding"
          className="rounded-xl border border-primary px-4 py-1.5 font-body text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground active:scale-[0.98] lg:px-6 lg:py-2 lg:text-base"
        >
          Rejoindre
        </Link>
      </div>
    </nav>
  );
}
