// Public legal document — linked from the signup checkbox (onboarding
// wizard's 'signup' step) and from Paramètres > À propos > Légal. Not
// auth-gated, unlike /app/parametres/*.
// Real first-draft content (2026-08-24, same pass as /conditions-utilisation
// — explicit user ask, "tu peux simplement écrire quelque chose"). Lists the
// actual data fields on the Profile/User models and the actual third-party
// processors wired in this deployment (Cloudinary photos, Resend email,
// Chariow payment, Sentry error tracking, Upstash Redis rate-limit/cache,
// Google OAuth) — cross-checked against .env.local before writing so this
// doesn't claim a provider that isn't actually configured. Ably is
// deliberately NOT listed: ABLY_API_KEY is unset in this deployment (see
// project memory — real-time chat explicitly deferred by the user), so
// claiming it would be a fabricated commitment. Not yet reviewed by a
// lawyer — see the note at the bottom — but this is real, substantive
// content, not a stand-in.
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
            Dernière mise à jour : 24 août 2026
          </p>
        </div>

        <div className="flex flex-col gap-5 font-body text-sm leading-relaxed text-foreground">
          <p>
            Cette politique explique quelles données YeOyo collecte, pourquoi, et comment tu gardes
            le contrôle dessus. Elle complète les{' '}
            <Link
              href="/conditions-utilisation"
              className="font-medium text-primary hover:underline"
            >
              conditions d&rsquo;utilisation
            </Link>
            .
          </p>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              1. Ce que nous collectons
            </h2>
            <p className="mb-2">
              <strong>Compte :</strong> ton email, ton mot de passe (jamais stocké en clair,
              uniquement sous forme chiffrée), ou ton identifiant Google si tu utilises la connexion
              Google.
            </p>
            <p className="mb-2">
              <strong>Profil :</strong> prénom, date de naissance, ville et commune, religion,
              situation matrimoniale, enfants, langues, centres d&rsquo;intérêt, bio, ce que tu
              recherches, et tes photos.
            </p>
            <p className="mb-2">
              <strong>Utilisation du service :</strong> tes demandes de contact, tes conversations,
              les signalements que tu émets ou reçois, ton statut de vérification de profil.
            </p>
            <p>
              <strong>Paiement :</strong> si tu achètes un pack de crédits, notre prestataire
              Chariow traite le paiement (Mobile Money ou carte) — nous ne recevons et ne stockons
              jamais ton numéro de carte ou tes identifiants Mobile Money, seulement la confirmation
              que le paiement a réussi.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              2. Pourquoi nous les utilisons
            </h2>
            <p>
              Pour faire fonctionner YeOyo : te proposer des profils pertinents dans Découvrir,
              permettre la messagerie une fois une demande acceptée, vérifier les profils et traiter
              les signalements, t&rsquo;envoyer les emails nécessaires (code de vérification,
              notifications importantes), traiter tes achats de crédits, et diagnostiquer les
              erreurs techniques quand quelque chose ne fonctionne pas comme prévu. Nous
              n&rsquo;utilisons jamais tes données pour de la publicité ciblée.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              3. Avec qui elles sont partagées
            </h2>
            <p className="mb-2">
              Tes photos et informations de profil sont visibles par les autres membres selon tes
              paramètres de visibilité — c&rsquo;est le principe même du service.
            </p>
            <p>
              Au-delà des autres membres, nous ne partageons tes données qu&rsquo;avec les
              prestataires techniques strictement nécessaires au fonctionnement de YeOyo :
              Cloudinary (hébergement des photos), Resend (envoi des emails), Chariow (paiement des
              packs de crédits), Sentry (suivi des erreurs techniques — jamais le contenu de tes
              conversations), Upstash (limitation du trafic et mise en cache), et Google si tu te
              connectes via Google. Nous ne vendons jamais tes données à des tiers.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">4. Cookies</h2>
            <p>
              YeOyo utilise des cookies strictement nécessaires au fonctionnement de ton compte :
              rester connecté, et te protéger contre les attaques (CSRF). Ils sont sécurisés
              (httpOnly) et ne servent ni à la publicité ni au tracking par des tiers.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              5. Combien de temps nous les gardons
            </h2>
            <p>
              Tant que ton compte est actif. Si tu supprimes ton compte, ton profil, tes photos et
              tes conversations sont supprimés. Nous pouvons conserver certaines informations liées
              aux paiements plus longtemps si une obligation légale ou comptable l&rsquo;exige.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              6. Tes droits
            </h2>
            <p>
              Tu peux consulter et modifier les informations de ton profil à tout moment depuis
              l&rsquo;application, une fois connecté. Tu peux supprimer ton compte depuis les
              paramètres — cela supprime tes données de profil. Pour toute question ou demande
              concernant tes données, écris-nous à{' '}
              <a
                href="mailto:contact@yeoyo.app"
                className="font-medium text-primary hover:underline"
              >
                contact@yeoyo.app
              </a>
              .
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              7. Sécurité
            </h2>
            <p>
              Ton mot de passe est chiffré avant stockage, jamais lisible par notre équipe. Les
              échanges avec YeOyo passent par une connexion sécurisée (HTTPS). Nous limitons
              l&rsquo;accès à tes données aux seules personnes de notre équipe qui en ont besoin
              pour faire fonctionner ou modérer le service.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">8. Mineurs</h2>
            <p>
              YeOyo est réservé aux personnes de 18 ans et plus. Nous ne collectons pas
              volontairement de données concernant des mineurs.
            </p>
          </div>

          <div>
            <h2 className="mb-1.5 font-headings text-base font-bold text-foreground">
              9. Modifications
            </h2>
            <p>
              Cette politique peut évoluer. Toute modification significative te sera signalée dans
              l&rsquo;application.
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
