// Loading placeholder shaped like an admin data table — a header bar plus
// N rows of column-width bars — used on the back-office list screens
// (membres, signalements, audit-log, …) while data is fetching.
import { Skeleton } from '@/components/ui/Skeleton';

export function AdminTableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 py-2">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={c === 0 ? 'h-4 w-1/4' : 'h-4 flex-1'} />
          ))}
        </div>
      ))}
    </div>
  );
}
