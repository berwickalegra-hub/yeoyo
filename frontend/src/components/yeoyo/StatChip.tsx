import { Icon, type IconName } from '@/components/ui/Icon';

// `icon` is optional so the original bare {value, label} usage keeps
// working — the trust-bar section of the "Rencontres Sérieuses Congo"
// landing redesign (2026-08-13) adds an icon circle above the value.
export function StatChip({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon?: IconName;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-foreground/10">
          <Icon name={icon} size={20} className="text-secondary-foreground" />
        </div>
      )}
      <span className="font-headings text-xl font-bold text-secondary-foreground lg:text-3xl">
        {value}
      </span>
      <span className="text-center font-body text-xs text-secondary-foreground/70 lg:text-sm">
        {label}
      </span>
    </div>
  );
}
