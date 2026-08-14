import Image from 'next/image';
import { UserAvatar } from '@/components/ui/UserAvatar';

// Full-bleed cover photo used by profile cards. Falls back to an initials
// avatar on a muted background when the profile has no primary photo yet
// (photo upload is optional/skippable in the onboarding wizard).
//
// Pass either `heightPx` (fixed pixel height, existing grid/swipe cards) or
// `aspectRatio` (e.g. "3/4" — Banani's ProfileCard.jsx uses `aspect-[3/4]`
// so the photo scales with the card's width instead of a fixed height).
export function ProfilePhotoCover({
  photoUrl,
  name,
  heightPx,
  aspectRatio,
}: {
  photoUrl: string | null;
  name: string;
  heightPx?: number;
  aspectRatio?: string;
}) {
  const sizeStyle = aspectRatio ? { aspectRatio } : { height: heightPx ?? 220 };

  if (photoUrl) {
    return (
      <div className="relative w-full" style={sizeStyle}>
        <Image src={photoUrl} alt={name} fill className="object-cover" />
      </div>
    );
  }
  return (
    <div className="flex w-full items-center justify-center bg-secondary" style={sizeStyle}>
      <UserAvatar name={name} size={72} />
    </div>
  );
}
