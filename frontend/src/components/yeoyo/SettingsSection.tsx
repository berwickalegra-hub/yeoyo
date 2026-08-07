'use client';

import type { ReactNode } from 'react';

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
