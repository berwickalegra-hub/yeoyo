import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

// Shown on Découvrir / Explorer when the discovery API reports the caller's
// own profile is "en retrait" (moderation hold). See Profile.moderationHeldAt.

export function HeldProfileBanner({ reason }: { reason: string | null | undefined }) {
  return (
    <div className="animate-fade-in mx-auto mb-5 max-w-2xl rounded-xl border border-red-500/40 bg-red-500/5 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600">
          <Icon name="shield" size={18} />
        </span>
        <div className="min-w-0">
          <p className="font-headings text-sm font-bold text-red-600">Ton profil est en retrait</p>
          {reason && (
            <p className="mt-1 font-body text-sm text-foreground">
              Raison : <span className="font-semibold">{reason}</span>
            </p>
          )}
          <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">
            Ton profil n&rsquo;apparaît plus dans Découvrir et tu ne peux pas envoyer de nouvelles
            demandes. Tes conversations en cours restent ouvertes. Corrige le point ci-dessus puis
            préviens l&rsquo;équipe — on réexamine et on réactive ton profil.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/app/profil"
              className="rounded-full bg-primary px-4 py-2 font-body text-xs font-semibold text-primary-foreground"
            >
              Modifier mon profil
            </Link>
            <Link
              href="/app/messages/equipe"
              className="rounded-full border border-border px-4 py-2 font-body text-xs font-medium text-foreground"
            >
              Écrire à l&rsquo;équipe
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
