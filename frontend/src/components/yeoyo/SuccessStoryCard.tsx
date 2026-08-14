import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';

// Rebuilt for the "Rencontres Sérieuses Congo" landing redesign
// (2026-08-13) — `role`/`status` replaced by `city` + a 5-star rating row,
// matching the Banani testimonial card shape. `initials` avatars only
// (no photo) — same no-fabricated-photo policy as the rest of the site's
// testimonials.
export function SuccessStoryCard({
  quote,
  name,
  city,
  rating = 5,
}: {
  quote: string;
  name: string;
  city: string;
  rating?: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 lg:p-8">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Icon
            key={i}
            name="star"
            size={14}
            fill={i < rating ? 'currentColor' : 'none'}
            className="text-gold"
          />
        ))}
      </div>
      <p className="mt-3 font-body text-sm italic leading-relaxed text-foreground lg:text-base">
        &ldquo;{quote}&rdquo;
      </p>
      <div className="mt-5 flex items-center gap-3 border-t border-border pt-5">
        <UserAvatar name={name} size={44} />
        <div>
          <p className="font-headings text-sm font-bold text-foreground">{name}</p>
          <p className="font-body text-xs text-muted-foreground">{city}</p>
        </div>
      </div>
    </div>
  );
}
