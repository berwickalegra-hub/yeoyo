import { Icon, type IconName } from '@/components/ui/Icon';

export function FeatureRow({ icon, title, desc }: { icon: IconName; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4 border-b border-border py-4 last:border-b-0 lg:block lg:rounded-lg lg:border lg:border-border lg:bg-background lg:p-6">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary lg:mb-4 lg:h-12 lg:w-12">
        <Icon name={icon} size={20} className="lg:hidden" />
        <Icon name={icon} size={24} className="hidden lg:block" />
      </div>
      <div>
        <p className="font-headings text-base font-semibold text-foreground lg:mb-2 lg:text-lg">
          {title}
        </p>
        <p className="mt-0.5 font-body text-sm leading-relaxed text-muted-foreground lg:mt-0">
          {desc}
        </p>
      </div>
    </div>
  );
}
