// Public legal document — linked from the signup checkbox (onboarding
// wizard's 'signup' step) and from Paramètres > À propos > Légal. Not
// auth-gated, unlike /app/parametres/*.
// Real first-draft content (2026-08-24, explicit user ask after comparing
// against Farata's onboarding checkbox — user didn't know what to put here
// and asked for a genuine draft rather than a placeholder). Tailored to
// what YeOyo actually does: Chariow/M-Pesa Premium billing (see
// lib/server/subscriptions/plans.ts for the real prices referenced below),
// the 3-report auto-suspend, and the /reglement community rules it
// incorporates by reference. Not yet reviewed by a lawyer — see the note
// at the bottom of the page — but this is real, substantive content, not
// a stand-in.
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
            Dernière mise à jour : 24 août 2026
          </p>
        </div>

        <div className="flex flex-col gap-5 font-body text-sm leading-relaxed text-foreground">
          <p>
            YeOyo est une application de mise en relation dédiée à la rencontre sérieuse et au
            mariage, pensée pour les Congolais en République Démocratique du Congo et dans la
            diaspora. En créant un compte, tu acceptes les présentes conditions dans leur
            intégralité, ainsi que le{' '}
            <Link href="/reglement" className="font-medium text-primary hover:underline">
              règlement de la communauté
            </Link>{' '}
            et la{' '}
            <Link href="/confidentialite" className="font-medium text-primary hover:underline">
              politique de confidentialité
            </Link>
            , qui en font partie intégrante.
          </p>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              1. Qui peut utiliser YeOyo
            </h2>
            <p>
              Pour créer un compte, tu dois avoir 18 ans révolus, disposer de la capacité juridique
              de contracter, et ne détenir qu&rsquo;un seul compte. Un compte précédemment suspendu
              pour violation du règlement ne peut pas être recréé sous une autre identité.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              2. Ton compte
            </h2>
            <p>
              Tu t&rsquo;engages à fournir des informations exactes (email, date de naissance,
              situation) et à les maintenir à jour. Tu es responsable de la confidentialité de tes
              identifiants et de toute activité effectuée depuis ton compte — préviens-nous
              immédiatement à{' '}
              <a
                href="mailto:contact@yeoyo.app"
                className="font-medium text-primary hover:underline"
              >
                contact@yeoyo.app
              </a>{' '}
              en cas d&rsquo;utilisation non autorisée.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              3. Utilisation du service
            </h2>
            <p>
              YeOyo doit être utilisé exclusivement dans le cadre d&rsquo;une recherche sincère de
              relation sérieuse ou de mariage, dans le respect du{' '}
              <Link href="/reglement" className="font-medium text-primary hover:underline">
                règlement de la communauté
              </Link>
              . Un profil qui reçoit 3 signalements est automatiquement suspendu le temps
              d&rsquo;une vérification par notre équipe ; une violation avérée peut entraîner la
              suspension ou la suppression définitive du compte, sans préavis ni remboursement des
              sommes déjà versées.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              4. Abonnement Premium et paiement
            </h2>
            <p className="mb-2">
              La création de compte et un usage de base (dont 5 demandes de contact gratuites par
              jour) sont gratuits. Un abonnement Premium débloque les messages illimités et des
              fonctionnalités additionnelles (boosts, visibilité). Les formules et prix en vigueur
              sont affichés dans l&rsquo;application avant tout paiement — actuellement 15 jours
              (3,99 $), 1 mois (offre de lancement), 3 mois (11,99 $) et 6 mois (18,00 $).
            </p>
            <p className="mb-2">
              Le paiement s&rsquo;effectue via notre prestataire Chariow (Mobile Money M-Pesa ou
              carte bancaire). Chaque abonnement correspond à un paiement unique pour la durée
              choisie : il ne se renouvelle pas automatiquement à son terme, sauf mention contraire
              affichée clairement au moment du paiement. Le prix payé au moment de l&rsquo;achat
              reste garanti jusqu&rsquo;à la fin de la période en cours, même si nos tarifs évoluent
              ensuite.
            </p>
            <p>
              Un abonnement activé n&rsquo;est en principe pas remboursable. Nous procédons
              toutefois à un remboursement en cas d&rsquo;erreur technique de notre part (double
              débit, service Premium non fourni après paiement confirmé) — contacte{' '}
              <a
                href="mailto:contact@yeoyo.app"
                className="font-medium text-primary hover:underline"
              >
                contact@yeoyo.app
              </a>{' '}
              dans les 7 jours suivant le paiement.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              5. Ton contenu
            </h2>
            <p>
              Tu conserves tes droits sur les photos et informations que tu publies. En les publiant
              sur YeOyo, tu nous accordes uniquement le droit de les afficher dans le cadre du
              service (profil, découverte, conversations). Tu garantis avoir le droit de publier ce
              contenu — pas de photos de tiers, de célébrités ou générées par IA, comme rappelé dans
              le règlement.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              6. Sécurité et responsabilité
            </h2>
            <p>
              Nous modérons les signalements et vérifions les profils quand c&rsquo;est possible,
              mais nous ne pouvons pas garantir l&rsquo;exactitude de chaque profil ni le
              comportement de chaque membre. Reste prudent(e) lors d&rsquo;une première rencontre en
              personne : privilégie un lieu public et informe un proche. YeOyo n&rsquo;est pas
              responsable des échanges ou rencontres ayant lieu en dehors de l&rsquo;application.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              7. Résiliation
            </h2>
            <p>
              Tu peux supprimer ton compte à tout moment depuis les paramètres de
              l&rsquo;application. YeOyo peut suspendre ou supprimer un compte en cas de violation
              du règlement ou des présentes conditions, notamment après des signalements vérifiés.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              8. Modifications et droit applicable
            </h2>
            <p>
              Ces conditions peuvent évoluer ; toute modification significative te sera signalée
              dans l&rsquo;application. Elles sont soumises au droit de la République Démocratique
              du Congo. Pour toute question, écris-nous à{' '}
              <a
                href="mailto:contact@yeoyo.app"
                className="font-medium text-primary hover:underline"
              >
                contact@yeoyo.app
              </a>
              .
            </p>
          </div>

          <p className="rounded-lg border border-dashed border-border bg-muted px-4 py-3 text-xs text-muted-foreground">
            Ce document reflète le fonctionnement réel de YeOyo à ce jour. Il n&rsquo;a pas encore
            été relu par un juriste — recommandé si l&rsquo;application prend de l&rsquo;ampleur,
            mais il est utilisable tel quel pour le lancement.
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
