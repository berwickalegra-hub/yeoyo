'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="font-headings text-base font-bold text-foreground">{title}</h2>
      {description && (
        <p className="mt-0.5 font-body text-sm text-muted-foreground">{description}</p>
      )}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

// Index-page row that navigates to a dedicated sub-page instead of
// expanding its content inline — see SettingsSubHeader.tsx for why the
// Paramètres index was split this way.
export function SettingsNavRow({
  href,
  icon,
  label,
  helper,
}: {
  href: string;
  icon: IconName;
  label: string;
  helper?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-transform active:scale-[0.99]"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
        <Icon name={icon} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-body text-sm font-medium text-foreground">{label}</p>
        {helper && (
          <p className="mt-0.5 truncate font-body text-xs text-muted-foreground">{helper}</p>
        )}
      </div>
      <Icon name="chevron-right" size={18} className="flex-shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function SettingsRow({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-body text-sm font-medium text-foreground">{label}</p>
        {helper && <p className="mt-0.5 font-body text-xs text-muted-foreground">{helper}</p>}
      </div>
      {children}
    </div>
  );
}
