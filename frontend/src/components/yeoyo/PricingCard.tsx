import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

// New component — the "Tarifs" section of the "Rencontres Sérieuses Congo"
// landing redesign (2026-08-13) has no equivalent card in the existing
// inventory. `variant` drives the border/badge treatment; free/featured
// share the same layout otherwise (locked-feature list is free-only,
// originalPrice/paymentMethods/footnote are featured-only). 2026-08-25:
// 'premium' renamed to 'featured' — the featured card now sells a credit
// pack, not a recurring Premium subscription.
export function PricingCard({
  variant,
  title,
  subtitle,
  price,
  priceSuffix,
  originalPrice,
  paymentMethods,
  includedFeatures,
  lockedFeatures,
  ctaLabel,
  ctaHref,
  footnote,
  badge,
}: {
  variant: 'free' | 'featured';
  title: string;
  subtitle: string;
  price: string;
  priceSuffix: string;
  originalPrice?: string;
  paymentMethods?: string;
  includedFeatures: string[];
  lockedFeatures?: string[];
  ctaLabel: string;
  ctaHref: string;
  footnote?: string;
  badge?: string;
}) {
  const isFeatured = variant === 'featured';
  return (
    <div
      className={`relative flex flex-col rounded-2xl bg-surface p-6 lg:p-8 ${
        isFeatured ? 'border-2 border-primary' : 'border border-border'
      }`}
    >
      {badge && (
        <span className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-gold px-4 py-1.5 font-body text-xs font-bold text-gold-foreground">
          <Icon name="zap" size={13} />
          {badge}
        </span>
      )}

      <p className="font-headings text-xl font-bold text-foreground">{title}</p>
      <p className="mt-1 font-body text-sm text-muted-foreground">{subtitle}</p>

      <div className="mt-5 flex items-baseline gap-2">
        {originalPrice && (
          <span className="font-body text-base text-muted-foreground line-through">
            {originalPrice}
          </span>
        )}
        <span className="font-headings text-3xl font-bold text-foreground lg:text-4xl">
          {price}
        </span>
        <span className="font-body text-sm text-muted-foreground">{priceSuffix}</span>
      </div>
      {paymentMethods && (
        <p className="mt-1.5 font-body text-xs text-muted-foreground">{paymentMethods}</p>
      )}

      <ul className="mt-6 flex flex-1 flex-col gap-3">
        {includedFeatures.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Icon name="check" size={16} className="mt-0.5 flex-shrink-0 text-verified" />
            <span className="font-body text-sm text-foreground">{f}</span>
          </li>
        ))}
        {lockedFeatures?.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Icon name="x" size={16} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
            <span className="font-body text-sm text-muted-foreground line-through">{f}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className={`mt-6 flex items-center justify-center gap-2 rounded-xl py-3 font-body text-sm font-semibold transition-opacity active:scale-[0.98] ${
          isFeatured
            ? 'bg-primary text-primary-foreground hover:opacity-90'
            : 'border border-primary text-primary hover:bg-primary hover:text-primary-foreground'
        }`}
      >
        {ctaLabel}
        <Icon name="arrow-right" size={16} />
      </Link>

      {footnote && (
        <p className="mt-3 text-center font-body text-[11px] text-muted-foreground">{footnote}</p>
      )}
    </div>
  );
}
