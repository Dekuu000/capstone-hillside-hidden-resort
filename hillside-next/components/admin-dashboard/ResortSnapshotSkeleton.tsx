import { Skeleton } from "../shared/Skeleton";

export function ResortSnapshotSkeleton() {
  return (
    <section className="surface p-4 sm:p-5">
      <Skeleton className="h-3 w-36" />
      <Skeleton className="mt-3 h-8 w-80 max-w-full" />
      <Skeleton className="mt-2 h-4 w-56" />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-20" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="mt-3 h-24 w-full" />
        <div className="mt-2 flex gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
    </section>
  );
}
