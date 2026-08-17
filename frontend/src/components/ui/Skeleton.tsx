// Shimmering placeholder block — building block for the shaped skeletons
// (ProfileCardSkeleton, MessageListSkeleton, AdminTableSkeleton) that
// replace bare spinners on list/table loading states. `rounded` and
// `w-full`/`h-4` are sane text-line defaults; pass `className` to shape it
// (e.g. `h-48 w-full rounded-xl` for a photo block).
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton-shimmer h-4 w-full rounded ${className}`} aria-hidden />;
}
