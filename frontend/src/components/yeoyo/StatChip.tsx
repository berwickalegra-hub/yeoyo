export function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-surface px-5 py-3 text-center lg:px-8 lg:py-8">
      <span className="font-headings text-xl font-bold text-primary lg:text-3xl">{value}</span>
      <span className="mt-0.5 text-center font-body text-xs text-muted-foreground lg:mt-2 lg:text-sm">
        {label}
      </span>
    </div>
  );
}
