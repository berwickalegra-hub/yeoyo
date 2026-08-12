import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

// Drill-down header shared by every /app/parametres/<section> sub-page —
// Paramètres used to be one long page with every field expanded at once
// (9 sections, dozens of inputs, one continuous scroll). Splitting it into
// per-section pages behind this back-linked header keeps each screen short
// enough to scan without losing the "where am I" context a flat back-arrow
// alone wouldn't give.
export function SettingsSubHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-5 lg:px-8">
      <Link
        href="/app/parametres"
        aria-label="Retour aux paramètres"
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Icon name="chevron-left" size={18} />
      </Link>
      <div>
        <h1 className="font-headings text-xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="mt-0.5 font-body text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
