// Public legal placeholder — linked from the signup checkbox (onboarding
// wizard's 'signup' step). Not auth-gated, unlike /app/parametres/*.
// Placeholder copy only, no fabricated legal commitments (same honesty
// precedent as /app/profil's "no fabricated data" fields) — replace with
// real terms before shipping to production.
import Link from 'next/link';
import { BrandMark } from '@/components/yeoyo/BrandMark';

export default function ConditionsUtilisationPage() {
  return (
    <main className="min-h-screen bg-background font-body">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10 lg:py-16">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark className="h-8 w-auto" />
          <span className="font-headings text-base font-bold text-foreground">YeOyo</span>
        </Link>

        <div>
          <h1 className="mb-2 font-headings text-3xl font-bold text-foreground">
            Conditions d&rsquo;utilisation
          </h1>
          <p className="font-body text-sm text-muted-foreground">
            Dernière mise à jour : à définir.
          </p>
        </div>

        <div className="flex flex-col gap-4 font-body text-sm leading-relaxed text-foreground">
          <p className="rounded-lg border border-dashed border-border bg-muted px-4 py-3 text-muted-foreground">
            Contenu à finaliser — cette page est un espace réservé fourni avec le starter YeOyo.
            Elle doit être remplacée par de vraies conditions d&rsquo;utilisation, rédigées ou
            validées par un professionnel du droit, avant toute mise en production.
          </p>
          <p>
            En créant un compte, tu t&rsquo;engages à fournir des informations exactes sur ton
            identité et ta situation, à respecter les autres membres de la communauté, et à ne pas
            utiliser YeOyo à des fins frauduleuses, commerciales non autorisées ou malveillantes.
          </p>
          <p>
            YeOyo se réserve le droit de suspendre ou de supprimer tout compte ne respectant pas ces
            règles, notamment en cas de signalement vérifié par la modération.
          </p>
        </div>

        <Link
          href="/onboarding"
          className="font-body text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          ← Retour à l&rsquo;inscription
        </Link>
      </div>
    </main>
  );
}
