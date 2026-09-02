// The YeOyo icon mark (two overlapping circles + rose lens), inlined
// from public/yeoyo-icon.svg so it can sit next to the "YeOyo" wordmark at
// any size via className, instead of loading an external asset. Colors are
// brand-locked (not theme tokens) — same convention as any logo mark that
// must stay recognizable regardless of the active ThemeContext palette.
export function BrandMark({ className = 'h-8 w-auto' }: { className?: string }) {
  return (
    <svg viewBox="0 0 148 100" fill="none" role="img" aria-label="YeOyo" className={className}>
      <circle cx="47" cy="50" r="40" fill="#1F3A2E" />
      <circle cx="101" cy="50" r="40" fill="#1F3A2E" />
      <path d="M74 20.49 A40 40 0 0 1 74 79.51 A40 40 0 0 1 74 20.49" fill="#D63C6D" />
    </svg>
  );
}
