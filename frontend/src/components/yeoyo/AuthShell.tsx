import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from './BrandMark';

// Shared branded shell for the auth pages that sit outside the app
// (login, forgot-password, reset-password). Gives them the same
// logo-links-home header + centered card treatment as the rest of the
// site instead of the bare unstyled form each page used to render on
// its own — see YeOyoNav for the logo mark this mirrors.
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-background font-body">
      <div className="flex justify-center px-5 py-6 lg:py-8">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark className="h-8 w-auto" />
          <span className="font-headings text-base font-bold tracking-tight text-foreground">
            YeOyo
          </span>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 pb-10">
        <div className="w-full max-w-md animate-fade-in-up lg:rounded-2xl lg:border lg:border-border lg:bg-surface lg:p-10 lg:shadow-xl lg:shadow-black/20">
          <div className="mb-6 text-center lg:text-left">
            <h1 className="font-headings text-2xl font-bold text-foreground">{title}</h1>
            {subtitle && <p className="mt-2 font-body text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="mt-6 text-center lg:text-left">{footer}</div>}
        </div>
      </div>
    </main>
  );
}
