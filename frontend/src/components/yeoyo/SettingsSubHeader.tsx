import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

// Drill-down header shared by every remaining /app/parametres/<section>
// sub-page (Compte/Notifications/Apparence/Paiement/Confidentialité/
// À propos). The /app/parametres index it used to link back to was deleted
// (2026-08-14, second pass, explicit user ask) — Mon Profil's "Paramètres"
// sidebar card is now the single entry point to these pages, so the back
// arrow returns there instead.
export function SettingsSubHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-5 py-5 lg:px-8">
      <Link
        href="/app/profil"
        aria-label="Retour à mon profil"
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
