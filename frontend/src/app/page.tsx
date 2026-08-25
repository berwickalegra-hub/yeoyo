// YeOyo landing page — public marketing page, built mobile-first from the
// Banani "YeOyo — Landing Page" screen (flow "Rencontres Sérieuses Congo",
// `l_YkRVFXx5e9/screens/LandingPage.jsx`, fetched 2026-08-13). Desktop-only
// export (no companion mobile screen) — the mobile layout below is this
// session's own responsive design, not a Banani mockup translation. See
// .planning/banani/landing-nouveau-theme-2.md for the full plan and
// .planning/banani/STATUS.md for the change log.
//
// This is the app's SECOND from-scratch Banani landing redesign — the
// first (light-blue, flow `alMLvZczLcpt`) shipped 2026-08-13 as the prior
// sitewide default. This terracotta/cream/PT-Serif theme now supersedes it
// (see globals.css / ThemeContext) per explicit user confirmation.
//
// Hero photo resolved (2026-08-13, user-supplied): the Banani flow-image
// endpoint for the hero's `<Image ar="3:4" prompt="Elegant modern
// Congolese couple…">` redirects to a stable storage.googleapis.com/
// banani-generated-images/ URL (this is Banani's own AI-generated image
// pipeline output — not a real, non-consenting person's photo — so it
// doesn't trip the project's no-fabricated-photo policy the way scraping
// a stock photo of a real couple would). See next.config.ts's
// remotePatterns entry for the same URL family.
export const runtime = 'nodejs';

import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Reveal } from '@/components/ui/Reveal';
import { StatChip } from '@/components/yeoyo/StatChip';
import { StepItem, StepConnector } from '@/components/yeoyo/StepItem';
import { SuccessStoryCard } from '@/components/yeoyo/SuccessStoryCard';
import { WhyFeatureCard } from '@/components/yeoyo/WhyFeatureCard';
import { PricingCard } from '@/components/yeoyo/PricingCard';
import { YeOyoNav } from '@/components/yeoyo/YeOyoNav';
import { BrandMark } from '@/components/yeoyo/BrandMark';
import { DownloadAppButton } from '@/components/yeoyo/DownloadAppButton';
import { FaqItem } from '@/components/yeoyo/FaqItem';
import { getPack, pricePerCredit } from '@/lib/server/credits/packs';

const FEATURED_PACK = getPack('serieux')!;

const WHY_FEATURES = [
  {
    icon: 'shield-check' as const,
    title: 'Zéro faux profil',
    desc: 'Chaque inscription est vérifiée manuellement. Ici tu parles à de vraies personnes.',
  },
  {
    icon: 'gem' as const,
    title: 'Le sérieux avant tout',
    desc: 'Pas de drague casual, pas de contenus déplacés. Juste des gens qui veulent vraiment se marier.',
  },
  {
    icon: 'lock' as const,
    title: 'Ta vie privée protégée',
    desc: "Mode anonyme, photos floutées jusqu'au match. C'est toi qui décides qui te voit.",
  },
  {
    icon: 'bot' as const,
    title: 'Coach IA Mbote',
    desc: 'Mbote, ton assistant IA personnel, te guide 24h/24. Conseils et ice-breakers pour bien démarrer.',
  },
];

const SECURITY_FEATURES = [
  {
    icon: 'user-check' as const,
    title: 'Vérification manuelle',
    desc: 'Pas de bot, pas de faux profil. Chaque inscription passe par notre équipe avant d’être validée.',
  },
  {
    icon: 'bot' as const,
    title: 'Modération IA intelligente',
    desc: 'Notre IA analyse chaque message. Contenu inapproprié ? Bloqué instantanément. Pas de place pour les arnaques.',
  },
  {
    icon: 'lock' as const,
    title: 'Contrôle total',
    desc: 'Mode anonyme, photos floues jusqu’au match. Tu décides qui te voit. Tes données restent les tiennes.',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Inscris-toi en 5 min',
    desc: 'Pseudo, email, quelques infos. C’est rapide et 100% gratuit.',
  },
  {
    n: '02',
    title: 'Découvre des profils compatibles',
    desc: 'Notre IA analyse tes critères et te propose des personnes qui te correspondent vraiment.',
  },
  {
    n: '03',
    title: 'Échange respectueusement',
    desc: 'Messages modérés par IA, ice-breakers pour bien démarrer. Juste l’essentiel.',
  },
  {
    n: '04',
    title: 'Rencontre ta moitié',
    desc: 'Quand le courant passe, YeOyo vous accompagne vers la vraie rencontre.',
  },
];

const TESTIMONIALS = [
  {
    quote:
      "YeOyo na biso. En 3 semaines j'ai rencontré quelqu'un de vrai. Kinshasa, 35 ans, sérieux — exactement ce que je cherchais.",
    name: 'Emmanuel K.',
    city: 'Kinshasa',
  },
  {
    quote:
      "J'avais peur des arnaques. Ici tout le monde est vérifié, je me sens respectée. YeOyo c'est vraiment différent.",
    name: 'Rosette M.',
    city: 'Lubumbashi',
  },
  {
    quote: "Simple, rapide, sérieux. J'ai trouvé ma moitié en moins d'un mois. Merci YeOyo.",
    name: 'Patrick N.',
    city: 'Goma',
  },
];

const NAV_LINKS = [
  { label: 'Accueil', href: '/' },
  { label: 'Comment ça marche', href: '#comment-ca-marche' },
  { label: 'Tarifs', href: '#tarifs' },
  { label: 'FAQ', href: '#faq' },
];

const FAQ_ITEMS = [
  {
    question: 'Est-ce vraiment gratuit ?',
    answer:
      'Oui. La création de profil, 3 photos, 5 demandes de contact par mois et la messagerie de base sont gratuites, pour toujours. Les crédits sont optionnels, pour celles et ceux qui veulent voir qui les a mis en favori, qui a visité leur profil, ou booster leur visibilité.',
  },
  {
    question: 'Comment fonctionne la vérification des profils ?',
    answer:
      "Chaque inscription passe par une vérification manuelle de notre équipe avant d'être validée, en plus d'une modération IA continue des messages. Zéro bot, zéro faux profil.",
  },
  {
    question: 'Mes informations et mes photos sont-elles privées ?',
    answer:
      "Oui. Mode anonyme disponible, photos floutées jusqu'au match. C'est toi qui décides qui voit ton profil et tes photos.",
  },
  {
    question: 'Est-ce que mes crédits expirent ?',
    answer:
      "Non. Un crédit acheté reste sur ton compte tant que tu ne l'utilises pas — pas d'abonnement, pas de reconduction, pas de date limite.",
  },
];
const FOOTER_CITIES = ['Kinshasa', 'Lubumbashi', 'Goma', 'Matadi', 'Kisangani'];
const FOOTER_LEGAL = ['Règlement', 'Confidentialité', 'Mentions légales', 'CGV'];

// Matches Banani's neutral bordered pill exactly (border-border/text-
// muted-foreground/font-medium) — `tone` picks bg-muted vs bg-surface (this
// project's token for Banani's "card" — no separate `--color-card` exists
// here, see globals.css) so the pill stays visible against whichever
// section background it sits on (Banani itself alternates: bg-muted on
// bg-background sections, bg-card on bg-muted sections).
function SectionEyebrow({
  icon,
  label,
  tone = 'muted',
}: {
  icon: 'map-pin' | 'heart' | 'shield' | 'zap' | 'tag';
  label: string;
  tone?: 'muted' | 'surface';
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-body text-xs font-medium text-muted-foreground ${tone === 'surface' ? 'bg-surface' : 'bg-muted'}`}
    >
      <Icon name={icon} size={13} />
      {label}
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h2 className="mt-3 font-headings text-2xl font-bold leading-tight text-foreground lg:text-4xl">
        {children}
      </h2>
      <div className="mt-3 h-1 w-16 rounded-full bg-primary" />
    </>
  );
}

export default function LandingPage() {
  return (
    <div className="bg-background font-body">
      <YeOyoNav />

      {/* Hero — entrance is a staggered on-mount animation (not scroll-
          triggered like <Reveal>), since this block is already in the
          initial viewport: text, then photo, then the two floating badges,
          each a beat behind the last, so the page feels like it's arriving
          rather than just appearing. */}
      <section className="px-5 pb-12 pt-10 lg:flex lg:items-center lg:gap-16 lg:px-12 lg:pb-24 lg:pt-20 xl:mx-auto xl:max-w-6xl">
        <div className="lg:max-w-xl lg:flex-1">
          <div className="animate-hero-rise" style={{ animationDelay: '0ms' }}>
            <SectionEyebrow icon="map-pin" label="Fait pour les Congolais sérieux" />
          </div>
          <h1
            className="animate-hero-rise mt-4 font-headings text-3xl font-bold leading-tight text-foreground lg:text-5xl"
            style={{ animationDelay: '90ms' }}
          >
            La bonne personne
            <br />
            t&rsquo;attend.
            <br />
            <span className="text-primary">Sérieusement.</span>
          </h1>
          <p
            className="animate-hero-rise mt-4 font-body text-sm leading-relaxed text-muted-foreground lg:mt-6 lg:text-lg"
            style={{ animationDelay: '180ms' }}
          >
            Tinder pousse vers le casual. Badoo est générique. Les canaux Telegram sont pleins de
            faux profils. YeOyo, c&rsquo;est différent : intention matrimoniale déclarée, profils
            vérifiés IA, zéro arnaque.
          </p>

          <div
            className="animate-hero-rise mt-6 flex flex-col gap-3 lg:mt-8 lg:flex-row lg:gap-4"
            style={{ animationDelay: '270ms' }}
          >
            <Link
              href="/onboarding"
              className="flex items-center justify-center gap-2 rounded-xl bg-primary py-4 text-center font-headings text-base font-bold text-primary-foreground transition-all hover:-translate-y-0.5 hover:opacity-90 hover:shadow-lg active:scale-[0.99] lg:px-8"
            >
              <Icon name="user-plus" size={18} />
              Créer mon profil gratuitement
            </Link>
            <DownloadAppButton />
          </div>
        </div>

        <div className="relative mt-8 w-full lg:mt-0 lg:w-96 lg:flex-shrink-0">
          <div
            className="animate-hero-photo-in aspect-[3/4] w-full overflow-hidden rounded-2xl border-4 border-surface shadow-lg"
            style={{ animationDelay: '150ms' }}
          >
            <Image
              src="/images/hero-couple.jpg"
              alt="Couple congolais élégant sur un rooftop à Kinshasa"
              width={1536}
              height={1024}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <div
            className="animate-hero-rise absolute -bottom-4 -left-4 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 shadow-lg"
            style={{ animationDelay: '560ms' }}
          >
            <Icon name="shield-check" size={16} className="text-verified" />
            <span className="font-body text-xs font-bold text-foreground">Profil vérifié</span>
          </div>
          <div
            className="animate-hero-rise absolute -right-4 -top-4 rounded-xl bg-secondary px-3 py-2 shadow-lg"
            style={{ animationDelay: '660ms' }}
          >
            <span className="font-body text-xs font-bold text-secondary-foreground">
              50 000+ membres
            </span>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="bg-secondary px-5 py-8 lg:px-12 lg:py-12">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-8">
          <StatChip icon="users" value="50 000+" label="membres actifs" />
          <StatChip icon="shield-check" value="100%" label="profils vérifiés IA" />
          <StatChip icon="gift" value="Gratuit" label="pour commencer" />
        </div>
      </section>

      {/* Pourquoi YeOyo */}
      <section id="pourquoi" className="px-5 py-12 lg:px-12 lg:py-20">
        <Reveal className="text-center xl:mx-auto xl:max-w-5xl">
          <SectionEyebrow icon="heart" label="Pourquoi YeOyo" />
          <SectionHeading>
            Pas une app de rencontre.
            <br />
            Une app pour se marier.
          </SectionHeading>
          <p className="mx-auto mt-3 max-w-xl font-body text-sm text-muted-foreground lg:text-base">
            On a créé YeOyo parce qu&rsquo;on n&rsquo;avait pas trouvé ce qu&rsquo;on cherchait :
            une plateforme sérieuse, sans arnaques, qui respecte vraiment les gens.
          </p>
        </Reveal>
        <div className="mx-auto mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:mt-16 lg:max-w-5xl lg:grid-cols-4 lg:gap-6">
          {WHY_FEATURES.map((f, i) => (
            <Reveal key={f.title} delayMs={i * 90}>
              <WhyFeatureCard {...f} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Sécurité */}
      <section className="bg-muted px-5 py-12 lg:px-12 lg:py-20">
        <Reveal className="text-center xl:mx-auto xl:max-w-5xl">
          <SectionEyebrow icon="shield" label="Sécurité" tone="surface" />
          <SectionHeading>Ta sécurité n&rsquo;est pas négociable</SectionHeading>
          <p className="mx-auto mt-3 max-w-xl font-body text-sm text-muted-foreground lg:text-base">
            Faux profils, arnaques, harcèlement... On gère tout. Toi, concentre-toi sur ta
            recherche.
          </p>
        </Reveal>
        <div className="mx-auto mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:mt-16 lg:max-w-5xl lg:gap-6">
          {SECURITY_FEATURES.map((f, i) => (
            <Reveal key={f.title} delayMs={i * 90}>
              <WhyFeatureCard {...f} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="comment-ca-marche" className="px-5 py-12 lg:px-12 lg:py-20">
        <Reveal className="text-center xl:mx-auto xl:max-w-5xl">
          <SectionEyebrow icon="zap" label="4 étapes" />
          <SectionHeading>De l&rsquo;inscription à la rencontre</SectionHeading>
          <p className="mx-auto mt-3 max-w-xl font-body text-sm text-muted-foreground lg:text-base">
            Simple, rapide, efficace. Ta future moitié est peut-être à quelques clics.
          </p>
        </Reveal>
        <div className="mx-auto mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:mt-16 lg:flex lg:max-w-5xl lg:grid-cols-none lg:items-start lg:gap-0">
          {STEPS.map((step, i) => (
            <div key={step.n} className="contents lg:flex lg:flex-1 lg:items-start">
              <Reveal delayMs={i * 110} className="lg:flex lg:flex-1">
                <StepItem {...step} />
              </Reveal>
              {i < STEPS.length - 1 && <StepConnector />}
            </div>
          ))}
        </div>
      </section>

      {/* CTA intermédiaire */}
      <section className="bg-primary px-5 py-12 text-center lg:px-12 lg:py-16">
        <Reveal>
          <h2 className="font-headings text-2xl font-bold text-primary-foreground lg:text-4xl">
            Ta moitié te cherche aussi.
          </h2>
          <p className="mx-auto mt-3 max-w-xl font-body text-sm text-primary-foreground/90 lg:text-lg">
            Rejoins des milliers de Congolais sérieux qui ont choisi YeOyo.
          </p>
          <Link
            href="/onboarding"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-foreground py-3.5 font-headings text-base font-bold text-primary transition-opacity hover:opacity-90 active:scale-[0.99] lg:mt-8 lg:w-auto lg:px-8"
          >
            <Icon name="user-plus" size={18} />
            Je me lance
          </Link>
        </Reveal>
      </section>

      {/* Tarifs — 2026-08-25: crédits à l'usage, achetés une fois, sans
          expiration, plutôt qu'un abonnement Premium récurrent. */}
      <section id="tarifs" className="px-5 py-12 lg:px-12 lg:py-20">
        <Reveal className="text-center xl:mx-auto xl:max-w-4xl">
          <SectionEyebrow icon="tag" label="Tarifs" />
          <SectionHeading>Simple et transparent</SectionHeading>
          <p className="mx-auto mt-3 max-w-xl font-body text-sm text-muted-foreground lg:text-base">
            Commence gratuitement. Achète des crédits quand tu en as besoin — ils n&apos;expirent
            jamais.
          </p>
        </Reveal>
        <div className="mx-auto mt-8 grid grid-cols-1 gap-6 lg:mt-16 lg:max-w-4xl lg:grid-cols-2 lg:gap-8">
          <Reveal>
            <PricingCard
              variant="free"
              title="Gratuit"
              subtitle="Découvre la plateforme à ton rythme"
              price="0"
              priceSuffix="Pour toujours"
              includedFeatures={[
                'Création de profil complet',
                '3 photos de profil',
                '5 demandes de contact par mois',
                'Voir tous les profils',
                'Répondre aux messages reçus',
                'Accepter ou refuser une demande',
                'Coach IA : 3 questions par jour',
              ]}
              lockedFeatures={[
                "Voir qui t'a mis en favori",
                'Voir qui a visité ton profil',
                'Boost de visibilité (24h)',
              ]}
              ctaLabel="Commencer"
              ctaHref="/onboarding"
            />
          </Reveal>
          <Reveal delayMs={120}>
            <PricingCard
              variant="featured"
              badge="Pack le plus populaire"
              title={FEATURED_PACK.name}
              subtitle={`${FEATURED_PACK.credits} crédits, valables à vie`}
              originalPrice={`${FEATURED_PACK.originalPriceTotal.toLocaleString('fr-FR')} FCFA`}
              price={FEATURED_PACK.priceTotal.toLocaleString('fr-FR')}
              priceSuffix={`FCFA · -${FEATURED_PACK.discountPct}%`}
              paymentMethods="Mobile Money · Carte bancaire"
              includedFeatures={[
                `${FEATURED_PACK.credits} crédits sans date d'expiration`,
                `Soit ${pricePerCredit(FEATURED_PACK).toLocaleString('fr-FR')} FCFA / crédit`,
                "Voir qui t'a mis en favori — 1 crédit",
                'Voir qui a visité ton profil — 1 crédit',
                'Boost de visibilité 24h — 3 crédits',
                '1er message après une demande acceptée — 1 crédit',
              ]}
              ctaLabel="Commencer"
              ctaHref="/onboarding"
              footnote="* 3 autres packs disponibles dans l'app — plus le pack est grand, moins le crédit coûte cher."
            />
          </Reveal>
        </div>
      </section>

      {/* Confiance — image break reprenant l'ancienne photo hero (remplacée
          plus haut par imgLanding.jpg), inspiré du bandeau photo + stat de
          bas de page Farata. Scroll-révélé avec le variant `reveal-photo`
          (fade + rise + léger scale) plutôt que le `<Reveal>` standard, pour
          que ce moment photo se distingue des reveals de section classiques. */}
      <section className="px-5 py-12 lg:px-12 lg:py-20">
        <Reveal className="reveal-photo relative mx-auto max-w-3xl overflow-hidden rounded-2xl shadow-lg">
          <div className="aspect-[4/3] w-full sm:aspect-[16/9]">
            <Image
              src="https://storage.googleapis.com/banani-generated-images/generated-images/b49704bd-8128-4ef4-b9ec-8f3aff0f3f27.jpg"
              alt="Couple congolais souriant, membres vérifiés YeOyo"
              width={1024}
              height={640}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/75 via-foreground/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-center lg:p-10">
            <p className="font-headings text-lg font-bold text-background lg:text-2xl">
              +50 000 Congolais sérieux nous font déjà confiance
            </p>
          </div>
        </Reveal>
      </section>

      {/* Témoignages */}
      <section className="bg-muted px-5 py-12 lg:px-12 lg:py-20">
        <Reveal className="text-center xl:mx-auto xl:max-w-5xl">
          <SectionEyebrow icon="heart" label="Ils l'ont fait" tone="surface" />
          <SectionHeading>Des Congolais qui ont trouvé leur moitié</SectionHeading>
        </Reveal>
        <div className="mx-auto mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:mt-16 lg:max-w-5xl lg:grid-cols-3 lg:gap-8">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delayMs={i * 90}>
              <SuccessStoryCard {...t} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-muted px-5 py-12 lg:px-12 lg:py-20">
        <Reveal className="text-center xl:mx-auto xl:max-w-5xl">
          <SectionEyebrow icon="shield" label="Questions fréquentes" tone="surface" />
          <SectionHeading>On répond à tes questions</SectionHeading>
        </Reveal>
        <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 lg:mt-12">
          {FAQ_ITEMS.map((item, i) => (
            <Reveal key={item.question} delayMs={i * 80}>
              <FaqItem {...item} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Bandeau final */}
      <section className="bg-secondary px-5 py-12 text-center lg:px-12 lg:py-20">
        <Reveal>
          <span className="font-body text-xs font-semibold uppercase tracking-widest text-secondary-foreground/70">
            YeOyo na biso
          </span>
          <h2 className="mt-2 font-headings text-2xl font-bold text-secondary-foreground lg:text-4xl">
            La bonne personne existe.
            <br />
            Elle est peut-être là, ce soir.
          </h2>
          <p className="mx-auto mt-3 max-w-xl font-body text-sm text-secondary-foreground/90 lg:text-lg">
            Rejoins YeOyo. Crée ton profil en 5 minutes. Rencontre des personnes vraies, sérieuses,
            qui te ressemblent.
          </p>
          <Link
            href="/onboarding"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-headings text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.99] lg:mt-8 lg:w-auto lg:px-8"
          >
            <Icon name="user-plus" size={18} />
            Créer mon profil gratuitement
          </Link>
        </Reveal>
      </section>

      {/* Footer */}
      <footer id="site-footer" className="bg-foreground px-5 py-8 lg:px-12 lg:py-12">
        {/* Mobile: flat block. Desktop: 5-col grid (logo spans 2). */}
        <div className="flex flex-col gap-4 lg:hidden">
          <div className="flex items-center gap-2">
            <BrandMark className="h-7 w-auto" />
            <span className="font-headings text-sm font-bold text-background">YeOyo</span>
          </div>
          <p className="font-body text-xs leading-relaxed text-background/60">
            La première application de rencontres sérieuses pensée pour les Congolais. Trouve ta
            moitié.
          </p>
          <div className="flex flex-wrap gap-5">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="font-body text-xs text-background/60">
                {link.label}
              </a>
            ))}
          </div>
          <p className="font-body text-xs text-background/60">contact@yeoyo.cd · Kinshasa, RDC</p>
          <p className="font-body text-xs text-background/60">
            © 2025 YeOyo. Tous droits réservés.
          </p>
        </div>

        <div className="hidden lg:block">
          <div className="mx-auto grid max-w-6xl grid-cols-5 gap-8">
            <div className="col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <BrandMark className="h-8 w-auto" />
                <span className="font-headings text-base font-bold text-background">YeOyo</span>
              </div>
              <p className="max-w-xs font-body text-xs leading-relaxed text-background/60">
                La première application de rencontres sérieuses pensée pour les Congolais. Trouve ta
                moitié.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {/* Generic on purpose: the payment page is hosted by the
                    provider, which decides which operators it actually
                    offers — naming specific ones here would be a promise
                    this app cannot keep. */}
                <span className="rounded-md border border-background/20 px-2 py-1 font-body text-[10px] text-background/60">
                  Mobile Money
                </span>
              </div>
            </div>
            <div>
              <h4 className="mb-3 font-body text-xs font-bold text-background">Navigation</h4>
              <div className="flex flex-col gap-2">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="font-body text-xs text-background/60 hover:text-background"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-3 font-body text-xs font-bold text-background">Rencontre</h4>
              <div className="flex flex-col gap-2">
                {FOOTER_CITIES.map((city) => (
                  <span key={city} className="font-body text-xs text-background/60">
                    {city}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-3 font-body text-xs font-bold text-background">Légal</h4>
              <div className="flex flex-col gap-2">
                {FOOTER_LEGAL.map((label) => (
                  <span key={label} className="font-body text-xs text-background/60">
                    {label}
                  </span>
                ))}
              </div>
              <p className="mt-4 font-body text-xs text-background/60">contact@yeoyo.cd</p>
              <p className="font-body text-xs text-background/60">Kinshasa, RDC</p>
            </div>
          </div>
          <div className="mx-auto mt-8 flex max-w-6xl items-center justify-between border-t border-background/10 pt-6">
            <p className="font-body text-xs text-background/60">
              © 2025 YeOyo. Tous droits réservés.
            </p>
            <p className="font-body text-xs text-background/60">Conçu avec ❤️ à Kinshasa</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
