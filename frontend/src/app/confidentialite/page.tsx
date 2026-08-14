// Public legal placeholder — linked from the signup checkbox (onboarding
// wizard's 'signup' step). Not auth-gated, unlike /app/parametres/*
// (that page is the authenticated visibility-settings screen, not this
// document). Placeholder copy only, no fabricated data-handling claims —
// replace with a real privacy policy before shipping to production.
import Link from 'next/link';
import { BrandMark } from '@/components/yeoyo/BrandMark';

export default function ConfidentialitePage() {
  return (
    <main className="min-h-screen bg-background font-body">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10 lg:py-16">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark className="h-8 w-auto" />
          <span className="font-headings text-base font-bold text-foreground">YeOyo</span>
        </Link>

        <div>
          <h1 className="mb-2 font-headings text-3xl font-bold text-foreground">
            Politique de confidentialité
          </h1>
          <p className="font-body text-sm text-muted-foreground">
            Dernière mise à jour : à définir.
          </p>
        </div>

        <div className="flex flex-col gap-4 font-body text-sm leading-relaxed text-foreground">
          <p className="rounded-lg border border-dashed border-border bg-muted px-4 py-3 text-muted-foreground">
            Contenu à finaliser — cette page est un espace réservé fourni avec le starter YeOyo.
            Elle doit être remplacée par une vraie politique de confidentialité, rédigée ou validée
            par un professionnel du droit, avant toute mise en production.
          </p>
          <p>
            YeOyo collecte les informations que tu fournis pour créer et compléter ton profil
            (email, photos, préférences de rencontre) afin de faire fonctionner le service : mise en
            relation, messagerie, vérification de profil et sécurité de la communauté.
          </p>
          <p>
            Tu peux à tout moment consulter, modifier ou supprimer les informations de ton profil
            depuis l&rsquo;application, une fois connecté.
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
