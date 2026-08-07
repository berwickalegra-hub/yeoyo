// YeOyo landing page — public marketing page, built mobile-first from the
// Banani "Landing Mobile" screen with `lg:` overrides layering in the
// "Landing Desktop" screen's 2-column hero, 4-column feature grid, and
// grouped footer. See .planning/banani/STATUS.md for the source screens.
export const runtime = 'nodejs';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { FeatureRow } from '@/components/yeoyo/FeatureRow';
import { ProfileCardSmall } from '@/components/yeoyo/ProfileCardSmall';
import { StatChip } from '@/components/yeoyo/StatChip';
import { TestimonialCard } from '@/components/yeoyo/TestimonialCard';
import { VerifiedBadge } from '@/components/yeoyo/VerifiedBadge';
import { YeOyoNav } from '@/components/yeoyo/YeOyoNav';

// Real fixture members (see scripts/seed-yeoyo-profiles.ts) with their real
// Banani-avatar photos — a fork with a live discovery loop should swap this
// for a live query (e.g. top N recently-verified profiles) once there's
// enough real member data to be genuine social proof.
const RECENT_PROFILES = [
  {
    name: 'Grace K.',
    age: 27,
    job: 'Infirmière',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/female/25-35/African/0',
  },
  {
    name: 'Patrick M.',
    age: 28,
    job: 'Ingénieur civil',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/25-35/African/1',
  },
  {
    name: 'Nadège M.',
    age: 31,
    job: 'Styliste',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/female/25-35/African/6',
  },
  {
    name: 'Dieudonné K.',
    age: 42,
    job: 'Comptable',
    photoUrl: 'https://storage.googleapis.com/banani-avatars/avatar/male/35-50/African/2',
  },
];

const FEATURES = [
  {
    icon: 'shield-check' as const,
    title: 'Vérification IA obligatoire',
    desc: 'Chaque profil est scanné. Faux profils supprimés automatiquement.',
  },
  {
    icon: 'heart-handshake' as const,
    title: 'Intention matrimoniale déclarée',
    desc: 'Ici, tout le monde cherche la même chose — le mariage. Pas de flou.',
  },
  {
    icon: 'smartphone' as const,
    title: 'Paiement Mobile Money',
    desc: 'M-Pesa, Airtel Money, Orange Money. Sans carte bancaire.',
  },
  {
    icon: 'lock' as const,
    title: 'Confidentialité totale',
    desc: 'Vos photos ne sont visibles que par vos matchs confirmés.',
  },
];

const TESTIMONIALS = [
  {
    quote: 'YeOyo nabali ngai mwasi ya solo. Biso tozali kosala lisano ya libala.',
    name: 'Didier K.',
    location: 'Kinshasa, Gombe',
  },
  {
    quote: 'Mobali na ngai asalaki verification — nasepeli mingi. Likambo ya sérieux.',
    name: 'Nadège M.',
    location: 'Kinshasa, Limete',
  },
];

const HOW_IT_WORKS = [
  {
    n: '01',
    title: 'Crée ton profil',
    desc: 'Déclare ton intention matrimoniale. Ajoute tes photos.',
  },
  {
    n: '02',
    title: 'Vérifie ton identité',
    desc: "L'IA confirme que tu es bien réel(le) en 2 minutes.",
  },
  {
    n: '03',
    title: 'Découvre des profils',
    desc: 'Parcours des profils 100% vérifiés près de toi à Kinshasa.',
  },
  {
    n: '04',
    title: 'Engage la conversation',
    desc: 'Débloque le tchat via Mobile Money — simple et sécurisé.',
  },
];

const FOOTER_COLUMNS = [
  {
    heading: 'Produit',
    links: [
      { label: 'Accueil', href: '/' },
      { label: 'Télécharger', href: '/telecharger' },
      { label: 'Blog', href: '/blog' },
    ],
  },
  {
    heading: 'Légal',
    links: [
      { label: 'Confidentialité', href: '/confidentialite' },
      { label: 'Conditions', href: '/conditions' },
      { label: 'Signaler', href: '/signaler' },
    ],
  },
  {
    heading: 'Contact',
    links: [
      { label: 'Support', href: '/support' },
      { label: 'hello@yeoyoapp.com', href: 'mailto:hello@yeoyoapp.com' },
    ],
  },
];

export default function LandingPage() {
  return (
    <div className="bg-background font-body">
      <YeOyoNav />

      {/* Hero + profile preview (mobile: stacked; lg: 2-col grid, side by side) */}
      <div className="px-5 pb-8 pt-6 lg:grid lg:grid-cols-2 lg:gap-12 lg:px-10 lg:py-16">
        <div className="flex flex-col justify-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 lg:mb-8 lg:px-4 lg:py-2">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="font-body text-xs text-primary lg:text-sm">
              Kinshasa · 100% Mobile Money
            </span>
          </div>
          <h1 className="font-headings text-3xl font-bold leading-tight text-foreground lg:text-4xl">
            La rencontre <br />
            <span className="text-primary">sérieuse</span>, faite <br />
            pour les Congolais
          </h1>
          <p className="mt-4 font-body text-sm leading-relaxed text-muted-foreground lg:max-w-lg lg:text-base">
            Profils vérifiés par IA. Intention matrimoniale déclarée. Zéro arnaque — likambo ya
            solo.
          </p>

          <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:gap-4">
            <Link
              href="/onboarding"
              className="rounded-xl bg-primary py-4 text-center font-headings text-base font-semibold text-primary-foreground lg:px-8"
            >
              Créer mon profil gratuitement
            </Link>
            <Link
              href="/app/explorer"
              className="flex items-center justify-center gap-2 rounded-xl border border-border py-3.5 font-body text-sm font-medium text-foreground lg:px-8 lg:py-4 lg:text-base"
            >
              <Icon name="search" size={16} />
              Parcourir les profils
            </Link>
          </div>

          <div className="mt-5 flex items-center gap-2 lg:mt-8 lg:gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-background bg-secondary lg:h-10 lg:w-10" />
            <span className="font-body text-xs text-muted-foreground lg:text-sm">
              <span className="font-semibold text-foreground">+12 000</span> membres à Kinshasa
            </span>
          </div>
        </div>

        <div className="mt-8 lg:mt-0 lg:flex lg:flex-col lg:justify-center">
          <div className="lg:rounded-xl lg:border lg:border-border lg:bg-surface lg:p-8">
            <div className="mb-3 flex items-center justify-between lg:mb-6">
              <span className="font-headings text-sm font-semibold text-foreground lg:text-lg">
                Profils récents
              </span>
              <VerifiedBadge label="Tous vérifiés IA" />
            </div>
            <div className="flex gap-3 overflow-x-auto lg:grid lg:grid-cols-2 lg:gap-4 lg:overflow-visible">
              {RECENT_PROFILES.map((profile, i) => (
                <div key={profile.name} className={i >= 2 ? 'hidden lg:block' : ''}>
                  <ProfileCardSmall {...profile} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Why YeOyo */}
      <div className="px-5 pb-8 lg:border-t lg:border-border lg:bg-surface lg:px-10 lg:py-16">
        <div className="mb-2 flex items-center gap-3 px-0 lg:mb-12 lg:justify-center">
          <div className="h-px flex-1 bg-border lg:max-w-24" />
          <span className="font-body text-xs uppercase tracking-widest text-muted-foreground lg:text-sm">
            Pourquoi YeOyo
          </span>
          <div className="h-px flex-1 bg-border lg:max-w-24" />
        </div>
        <h2 className="hidden text-center font-headings text-3xl font-bold text-foreground lg:mb-0 lg:block">
          La plateforme de confiance
        </h2>
        <div className="lg:mx-auto lg:mt-12 lg:grid lg:max-w-5xl lg:grid-cols-2 lg:gap-8">
          {FEATURES.map((f) => (
            <FeatureRow key={f.title} {...f} />
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="px-5 pb-8 lg:bg-background lg:px-10 lg:py-16">
        <div className="grid grid-cols-3 gap-3 lg:mx-auto lg:max-w-3xl lg:gap-6">
          <StatChip value="12K+" label="membres" />
          <StatChip value="94%" label="profils vérifiés" />
          <StatChip value="3 min" label="délai moyen d'inscription" />
        </div>
      </div>

      {/* Testimonials */}
      <div className="px-5 pb-8 lg:border-t lg:border-border lg:bg-surface lg:px-10 lg:py-16">
        <div className="lg:mx-auto lg:max-w-5xl">
          <h2 className="mb-4 font-headings text-xl font-bold text-foreground lg:mb-10 lg:text-3xl">
            Ils ont trouvé leur moitié
          </h2>
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-6">
            {TESTIMONIALS.map((t) => (
              <TestimonialCard key={t.name} {...t} />
            ))}
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="px-5 pb-8 lg:bg-background lg:px-10 lg:py-16">
        <div className="lg:mx-auto lg:max-w-5xl">
          <h2 className="mb-5 font-headings text-xl font-bold text-foreground lg:mb-12 lg:text-3xl">
            Comment ça marche
          </h2>
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-4 lg:gap-6">
            {HOW_IT_WORKS.map((step) => (
              <div
                key={step.n}
                className="flex items-start gap-4 lg:block lg:rounded-lg lg:border lg:border-border lg:bg-surface lg:p-6"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-primary lg:mb-4 lg:h-12 lg:w-12 lg:border-2">
                  <span className="font-headings text-xs font-bold text-primary lg:text-sm">
                    {step.n}
                  </span>
                </div>
                <div className="pt-1 lg:pt-0">
                  <p className="font-headings text-base font-semibold text-foreground lg:mb-3">
                    {step.title}
                  </p>
                  <p className="mt-0.5 font-body text-sm leading-relaxed text-muted-foreground lg:mt-0">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="border-t border-border bg-surface px-5 pb-10 pt-6 text-center lg:px-10 lg:py-16">
        <div className="lg:mx-auto lg:max-w-2xl">
          <p className="mb-3 font-body text-xs uppercase tracking-widest text-muted-foreground lg:mb-4 lg:text-sm">
            Commence maintenant
          </p>
          <h2 className="mb-6 font-headings text-2xl font-bold text-foreground lg:mb-8 lg:text-3xl">
            Mokili mobimba ikomela yo <span className="text-primary">—</span>
            <br />
            ta personne t&rsquo;attend ici.
          </h2>
          <Link
            href="/onboarding"
            className="mb-3 inline-block w-full rounded-xl bg-primary py-4 font-headings text-base font-semibold text-primary-foreground lg:mb-4 lg:w-auto lg:px-10"
          >
            Rejoindre YeOyo
          </Link>
          <p className="font-body text-xs text-muted-foreground lg:text-sm">
            Gratuit à l&rsquo;inscription — Paiement Mobile Money uniquement
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-background px-5 py-6 lg:px-10 lg:py-10">
        {/* Mobile: flat link row. Desktop: grouped columns (Banani ships
            genuinely different information architecture per breakpoint here,
            not just a restyle, so this is the one section with two markups). */}
        <div className="flex flex-col gap-4 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <span className="font-headings text-xs font-bold text-primary-foreground">Y</span>
            </div>
            <span className="font-headings text-sm font-bold text-foreground">YeOyo</span>
          </div>
          <p className="font-body text-xs leading-relaxed text-muted-foreground">
            La première app de rencontres sérieuses pour les Congolais. Kinshasa, RDC.
          </p>
          <div className="flex gap-5">
            <Link href="/confidentialite" className="font-body text-xs text-muted-foreground">
              Confidentialité
            </Link>
            <Link href="/conditions" className="font-body text-xs text-muted-foreground">
              Conditions
            </Link>
            <Link href="/support" className="font-body text-xs text-muted-foreground">
              Contact
            </Link>
          </div>
          <p className="font-body text-xs text-muted-foreground">© 2025 YeOyo</p>
        </div>

        <div className="hidden lg:block">
          <div className="mx-auto grid max-w-6xl grid-cols-4 gap-12">
            <div>
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
                  <span className="font-headings text-xs font-bold text-primary-foreground">Y</span>
                </div>
                <span className="font-headings text-base font-bold text-foreground">YeOyo</span>
              </div>
              <p className="font-body text-xs leading-relaxed text-muted-foreground">
                La première app de rencontres sérieuses pour les Congolais.
              </p>
            </div>
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.heading}>
                <h4 className="mb-4 font-headings text-sm font-semibold text-foreground">
                  {col.heading}
                </h4>
                <div className="flex flex-col gap-2">
                  {col.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="font-body text-xs text-muted-foreground hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-10 max-w-6xl border-t border-border pt-6 text-center">
            <p className="font-body text-xs text-muted-foreground">© 2025 YeOyo — Kinshasa, RDC</p>
          </div>
        </div>
      </div>
    </div>
  );
}
