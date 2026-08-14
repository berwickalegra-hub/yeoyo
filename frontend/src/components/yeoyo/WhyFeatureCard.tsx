import { Icon, type IconName } from '@/components/ui/Icon';

export function WhyFeatureCard({
  icon,
  title,
  desc,
}: {
  icon: IconName;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-md lg:p-6">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent lg:h-14 lg:w-14">
        <Icon name={icon} size={24} className="text-primary" />
      </div>
      <p className="font-headings text-base font-bold text-foreground lg:text-lg">{title}</p>
      <p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}
