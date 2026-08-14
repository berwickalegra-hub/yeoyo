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

// Groups related SettingsNavRow items into one card with dividers between
// rows, instead of each row being its own separate bordered card — reads as
// organized sections at a glance (mirrors the reference grouped-settings
// pattern: "Pause notifications"+"General settings" in one card, "Dark
// mode"+"Language"+"My Contact" in the next, …) rather than a flat stack of
// N identical cards the eye has to scan one by one.
export function SettingsGroupCard({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {children}
    </div>
  );
}

// Index-page row that navigates to a dedicated sub-page instead of
// expanding its content inline — see SettingsSubHeader.tsx for why the
// Paramètres index was split this way. Meant to live inside a
// SettingsGroupCard (no border/rounding of its own — the group card owns
// the outer shape and the `divide-y` between rows).
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
      className="flex items-center gap-3 p-4 transition-colors active:bg-secondary/20"
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
