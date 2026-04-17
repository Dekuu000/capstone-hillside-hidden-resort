import { cn } from "../../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="surface p-4">
      <Skeleton className="mb-3 h-6 w-1/4" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, idx) => (
          <Skeleton key={idx} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
