// Community rules — public, linked from the onboarding signup checkbox and
// from Paramètres > À propos, per the product spec's P0 "Règles
// communautaires visibles" requirement (must be shown at signup AND
// reachable at any time). Adapted (2026-08-22, explicit user ask) from a
// competitor's rules page structure, but rewritten for YeOyo's own
// positioning — no religious framing (YeOyo treats religion as a personal
// profile filter, not a platform identity, unlike the source app) — and
// grounded in DRC context (dot, family introductions) instead of the
// source app's Senegal/Islamic framing. Unlike /conditions-utilisation and
// /confidentialite, this is house rules, not a legal contract, so it's
// real content, not a placeholder.
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';
import { BrandMark } from '@/components/yeoyo/BrandMark';

interface RuleSection {
  icon: IconName;
  number: string;
  title: string;
  intro?: string;
  items: string[];
}

const SECTIONS: RuleSection[] = [
  {
    icon: 'heart',
    number: '01',
    title: 'Intention sincère',
    intro: 'En t’inscrivant sur YeOyo, tu t’engages à :',
    items: [
      'Rechercher sincèrement le mariage ou une relation sérieuse menant au mariage',
      'Être honnête sur ta situation (statut civil, enfants) et tes intentions',
      'Respecter la démarche des autres membres, même si elle ne te correspond pas',
      'Ne pas utiliser YeOyo pour du casual ou « juste pour voir »',
    ],
  },
  {
    icon: 'camera',
    number: '02',
    title: 'Profil et photos',
    items: [
      'Photos récentes qui te représentent réellement, montrant clairement ton visage',
      'Pas de photos de tiers, de célébrités ou générées par IA',
      'Informations exactes : âge, commune, religion, situation familiale, profession',
      'La vérification par selfie est fortement encouragée — elle te donne le badge « Profil vérifié », mis en avant dans la Découverte',
    ],
  },
  {
    icon: 'message-circle',
    number: '03',
    title: 'Communication respectueuse',
    items: [
      'Langage correct — pas de propos vulgaires, insultants ou à caractère sexuel non sollicités',
      'Respecte un refus : si quelqu’un décline ta demande ou arrête d’échanger, n’insiste pas',
      'Pas de harcèlement ni de messages répétés non désirés',
      'Reste prudent(e) : tu échanges avec quelqu’un que tu ne connais pas encore',
    ],
  },
  {
    icon: 'users',
    number: '04',
    title: 'La famille, à ton rythme',
    intro: 'Le mariage se construit rarement seul — YeOyo encourage :',
    items: [
      'L’implication progressive de la famille quand la relation devient sérieuse',
      'La transparence avec tes proches sur ta démarche',
      'Le respect des coutumes propres à chaque famille (dot, présentations, cérémonies) quand le moment vient',
    ],
  },
  {
    icon: 'flag',
    number: '05',
    title: 'Signalement et modération',
    items: [
      'Signale tout comportement suspect via le bouton dédié, sur un profil ou dans une conversation',
      'Notre équipe examine chaque signalement, avec un objectif de moins de 24h',
      'Un profil recevant 3 signalements est automatiquement suspendu, le temps d’une vérification',
      'Un signalement mensonger ou abusif peut lui aussi entraîner une sanction',
    ],
  },
  {
    icon: 'lock',
    number: '06',
    title: 'Confidentialité entre membres',
    items: [
      'Ne partage pas les informations ou photos d’un autre membre sans son accord',
      'Protège tes propres informations tant que la confiance n’est pas établie',
      'Reste vigilant(e) avant de partager ton numéro personnel en dehors de l’app',
    ],
  },
];

const FORBIDDEN = [
  'Demander ou envoyer des photos indécentes',
  'Tenir des propos à caractère sexuel',
  'Usurper l’identité d’une autre personne',
  'Créer plusieurs comptes',
  'Harceler d’autres membres',
  'Demander de l’argent ou arnaquer',
  'Promouvoir des activités illégales',
  'Diffuser des contenus haineux ou discriminatoires (ethnie, religion, origine)',
  'Utiliser la plateforme à des fins autres que la recherche d’une relation sérieuse',
];

export default function ReglementPage() {
  return (
    <main className="min-h-screen bg-background font-body">
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-10 lg:py-16">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark className="h-8 w-auto" />
          <span className="font-headings text-base font-bold text-foreground">YeOyo</span>
        </Link>

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
            <Icon name="shield" size={26} className="text-primary" />
          </div>
          <h1 className="font-headings text-2xl font-bold text-foreground lg:text-3xl">
            Règlement de la communauté
          </h1>
          <p className="max-w-md font-body text-sm text-muted-foreground">
            Pour garantir un espace sérieux et respectueux, tous les membres s’engagent à respecter
            ces règles, dans l’esprit de la démarche matrimoniale en Afrique francophone.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {SECTIONS.map((section) => (
            <div key={section.number} className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <Icon name={section.icon} size={18} className="text-primary" />
                </div>
                <div>
                  <span className="font-body text-xs font-semibold uppercase tracking-wide text-primary">
                    {section.number}
                  </span>
                  <h2 className="font-headings text-base font-bold text-foreground">
                    {section.title}
                  </h2>
                </div>
              </div>
              {section.intro && (
                <p className="mb-2 font-body text-sm text-muted-foreground">{section.intro}</p>
              )}
              <ul className="flex flex-col gap-1.5">
                {section.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 font-body text-sm text-foreground"
                  >
                    <Icon
                      name="check-circle"
                      size={15}
                      className="mt-0.5 flex-shrink-0 text-primary"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-950/20">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                <Icon name="x-circle" size={18} className="text-red-600 dark:text-red-400" />
              </div>
              <h2 className="font-headings text-base font-bold text-red-700 dark:text-red-400">
                Comportements strictement interdits
              </h2>
            </div>
            <ul className="flex flex-col gap-1.5">
              {FORBIDDEN.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 font-body text-sm text-red-800 dark:text-red-300"
                >
                  <Icon
                    name="x-circle"
                    size={14}
                    className="mt-1 flex-shrink-0 text-red-500 dark:text-red-400"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-xl bg-primary p-5 text-center">
          <p className="font-body text-sm font-medium text-primary-foreground">
            En utilisant YeOyo, tu confirmes avoir lu et accepté ce règlement. Le non-respect de ces
            règles peut entraîner la suspension ou la suppression de ton compte sans préavis.
          </p>
          <p className="mt-2 font-body text-xs text-primary-foreground/70">
            Dernière mise à jour : août 2026
          </p>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 font-body text-sm">
          <Link
            href="/conditions-utilisation"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Conditions d’utilisation
          </Link>
          <Link
            href="/confidentialite"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Politique de confidentialité
          </Link>
          <Link
            href="/onboarding"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            ← Retour à l’inscription
          </Link>
        </div>
      </div>
    </main>
  );
}
