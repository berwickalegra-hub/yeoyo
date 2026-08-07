import Image from 'next/image';
import { UserAvatar } from '@/components/ui/UserAvatar';

// Full-bleed cover photo used by profile cards. Falls back to an initials
// avatar on a muted background when the profile has no primary photo yet
// (photo upload is optional/skippable in the onboarding wizard).
export function ProfilePhotoCover({
  photoUrl,
  name,
  heightPx = 220,
}: {
  photoUrl: string | null;
  name: string;
  heightPx?: number;
}) {
  if (photoUrl) {
    return (
      <div className="relative w-full" style={{ height: heightPx }}>
        <Image src={photoUrl} alt={name} fill className="object-cover" />
      </div>
    );
  }
  return (
    <div
      className="flex w-full items-center justify-center bg-secondary"
      style={{ height: heightPx }}
    >
      <UserAvatar name={name} size={72} />
    </div>
  );
}
