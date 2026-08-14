import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { ProfileCard } from '@/lib/yeoyo/types';

// Banani's WhoLikedBanner.jsx (Accueil sidebar) — teaser for "X personnes
// apprécient ton profil", backed by real GET /api/profile/favorited-by
// (Favorite rows targeting me). Avatars are real photos, blurred via CSS
// (matches Banani's own `filter blur-sm` — the blur itself IS the paywall
// gate, not a fabricated placeholder), so the count/who is always honest —
// only the "who" resolution is withheld pre-Premium, matching Banani's own
// copy exactly ("Passe Premium pour les voir"). Colors match Banani's
// source verbatim: `bg-accent/10 border-accent`, CTA `bg-accent
// text-accent-foreground` — NOT primary (re-verified 2026-08-14 against
// the raw WhoLikedBanner.jsx fetch).
export function WhoLikedBanner({ preview, total }: { preview: ProfileCard[]; total: number }) {
  if (total === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-accent bg-accent/10 p-4">
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">
          {preview.slice(0, 3).map((p) => (
            <div
              key={p.userId}
              className="h-9 w-9 overflow-hidden rounded-full border-2 border-background blur-sm"
            >
              <UserAvatar name={p.firstName} avatarUrl={p.photoUrl} size={36} />
            </div>
          ))}
        </div>
        <div>
          <p className="font-body text-sm font-bold text-foreground">
            {total} {total > 1 ? 'personnes apprécient' : 'personne apprécie'} ton profil
          </p>
          <p className="font-body text-xs text-muted-foreground">Passe Premium pour les voir</p>
        </div>
      </div>
      <Link
        href="/app/premium"
        className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 py-2 font-body text-sm font-bold text-accent-foreground"
      >
        <Icon name="crown" size={14} />
        Découvrir
      </Link>
    </div>
  );
}
