import { UserAvatar } from '@/components/ui/UserAvatar';

export function TestimonialCard({
  quote,
  name,
  location,
}: {
  quote: string;
  name: string;
  location: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="font-body text-sm italic leading-relaxed text-foreground">
        &ldquo;{quote}&rdquo;
      </p>
      <div className="mt-4 flex items-center gap-3">
        <UserAvatar name={name} size={40} />
        <div>
          <p className="font-headings text-sm font-semibold text-foreground">{name}</p>
          <p className="font-body text-xs text-muted-foreground">{location}</p>
        </div>
      </div>
    </div>
  );
}
