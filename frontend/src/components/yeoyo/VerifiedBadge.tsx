export function VerifiedBadge({ label = 'Profil vérifié IA' }: { label?: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5">
      <div className="h-2 w-2 rounded-full bg-verified" />
      <span className="font-body text-xs font-medium text-foreground">{label}</span>
    </div>
  );
}
