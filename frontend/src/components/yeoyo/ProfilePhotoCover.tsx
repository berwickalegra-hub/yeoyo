import Image from 'next/image';
import { UserAvatar } from '@/components/ui/UserAvatar';

// Full-bleed cover photo used by profile cards. Falls back to an initials
// avatar on a muted background when the profile has no primary photo yet
// (photo upload is optional/skippable in the onboarding wizard).
//
// Pass either `heightPx` (fixed pixel height, existing grid/swipe cards) or
// `aspectRatio` (e.g. "3/4" — Banani's ProfileCard.jsx uses `aspect-[3/4]`
// so the photo scales with the card's width instead of a fixed height).
//
// 2026-08-31 (explicit user report — a real user's full-body screenshot and
// another's black-bar group photo rendered "really long" / inconsistent next
// to the seed profiles' tidy stock photos): real uploads used to be served
// at their original dimensions, so an odd source ratio leaked through even
// with `object-cover`. We now ask Cloudinary to crop every real upload to
// the target ratio with subject-aware gravity (`c_fill,g_auto`) BEFORE
// delivery — so a 9:16 screenshot and a 1:1 selfie both arrive as the same
// tidy 3:4 frame centred on the person. Seed/fixture photos store a full
// external URL as their key (Pexels/GCS, already well-proportioned) and are
// passed through untouched.

/** Inject a Cloudinary crop transform into a delivery URL. No-op for
 *  non-Cloudinary URLs (seed fixtures) and URLs that already carry a
 *  transform segment. */
function cloudinaryCrop(url: string, aspectRatio: string | undefined): string {
  const marker = '/image/upload/';
  const at = url.indexOf(marker);
  if (at === -1) return url;
  const head = url.slice(0, at + marker.length);
  const tail = url.slice(at + marker.length);
  // Already transformed (segment like `c_fill,.../` or `w_600/`) — leave it.
  if (/^[a-z]{1,3}_[^/]+\//.test(tail)) return url;
  const parts = ['c_fill', 'g_auto', 'w_600', 'q_auto', 'f_auto'];
  if (aspectRatio) parts.push(`ar_${aspectRatio.replace('/', ':')}`);
  return `${head}${parts.join(',')}/${tail}`;
}

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
    // heightPx cards are ~4:5 tall in practice (fixed height, card-width
    // varies) — a 3:4 crop centred on the subject fits every current caller.
    const src = cloudinaryCrop(photoUrl, aspectRatio ?? '3/4');
    return (
      <div className="relative w-full overflow-hidden" style={sizeStyle}>
        <Image
          src={src}
          alt={name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden bg-secondary"
      style={sizeStyle}
    >
      <UserAvatar name={name} size={72} />
    </div>
  );
}
