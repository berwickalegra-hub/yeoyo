import Image from 'next/image';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 40,
  className = '',
}: {
  name: string;
  avatarUrl?: string | null | undefined;
  size?: number;
  className?: string;
}) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={size}
        height={size}
        // Explicit inline width/height (not just the next/image props) so
        // this stays a perfect circle regardless of the source photo's own
        // aspect ratio — Tailwind's preflight `img { height: auto }` can
        // otherwise win over the HTML width/height attributes and stretch
        // portrait photos into an oval (2026-08-19 regression report).
        style={{ width: size, height: size }}
        className={`aspect-square flex-shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground font-headings font-semibold ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
