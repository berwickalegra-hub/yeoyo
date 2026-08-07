import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { UserAvatar } from '@/components/ui/UserAvatar';

// Banani's mockup fills the top of this card with a stock photo per profile.
// `photoUrl` is optional so this still degrades to an initials avatar for
// any caller without a real photo on hand.
export function ProfileCardSmall({
  name,
  age,
  job,
  photoUrl,
}: {
  name: string;
  age: number;
  job: string;
  photoUrl?: string | undefined;
}) {
  return (
    <div className="w-[148px] flex-shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
      <div className="relative flex h-[160px] items-center justify-center bg-secondary">
        {photoUrl ? (
          <Image src={photoUrl} alt={name} fill className="object-cover" sizes="148px" />
        ) : (
          <UserAvatar name={name} size={64} />
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="font-headings text-sm font-semibold text-foreground">{name}</span>
          <span className="text-xs text-muted-foreground">{age}</span>
        </div>
        <span className="font-body text-xs text-muted-foreground">{job}</span>
        <div className="mt-2 flex items-center gap-1">
          <Icon name="gem" size={10} />
          <span className="font-body text-primary" style={{ fontSize: '10px' }}>
            Mariage
          </span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1 border-t border-border py-1">
        <Icon name="shield-check" size={10} />
        <span className="font-body text-primary" style={{ fontSize: '10px' }}>
          Vérifié
        </span>
      </div>
    </div>
  );
}
