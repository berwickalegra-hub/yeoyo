import Link from 'next/link';

const DESKTOP_LINKS = [
  { label: 'Accueil', href: '/' },
  { label: 'Télécharger', href: '/telecharger' },
  { label: 'Blog', href: '/blog' },
];

export function YeOyoNav() {
  return (
    <nav className="flex items-center justify-between border-b border-border bg-background px-5 py-4 lg:px-10 lg:py-5">
      <div className="flex items-center gap-2 lg:gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary lg:h-10 lg:w-10">
          <span className="font-headings text-sm font-bold text-primary-foreground lg:text-base">
            Y
          </span>
        </div>
        <span className="font-headings text-base font-bold tracking-tight text-foreground lg:text-lg">
          YeOyo
        </span>
      </div>

      <div className="hidden items-center gap-8 lg:flex">
        {DESKTOP_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="font-body text-sm text-muted-foreground hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <Link
        href="/onboarding"
        className="rounded-xl border border-primary px-4 py-1.5 font-body text-sm font-medium text-primary lg:px-6 lg:py-2 lg:text-base"
      >
        Rejoindre
      </Link>
    </nav>
  );
}
