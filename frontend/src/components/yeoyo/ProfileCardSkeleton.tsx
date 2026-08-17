// Loading placeholder shaped like ProfileGridCard/RecommendedProfileCard —
// a photo block + two text lines — used while a profile grid/list is
// fetching, instead of a spinner. `count` renders several in a row (the
// caller places them inside its own grid).
import { Skeleton } from '@/components/ui/Skeleton';

function OneCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <Skeleton className="h-[200px] w-full rounded-none" />
      <div className="flex flex-col gap-2 px-4 pb-4 pt-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

export function ProfileCardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <OneCard key={i} />
      ))}
    </>
  );
}
