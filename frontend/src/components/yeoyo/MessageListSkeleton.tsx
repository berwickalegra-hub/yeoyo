// Loading placeholder shaped like a conversation/message row — round
// avatar + two text lines — used on Messages' inbox list and a
// conversation thread while data is fetching, instead of a spinner.
import { Skeleton } from '@/components/ui/Skeleton';

function OneRow() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
      <Skeleton className="h-14 w-14 flex-shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export function MessageListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <OneRow key={i} />
      ))}
    </div>
  );
}
