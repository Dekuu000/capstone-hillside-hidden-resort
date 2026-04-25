import { Skeleton } from "../../components/shared/Skeleton";

export default function BookLoading() {
  return (
    <section className="mx-auto w-full max-w-7xl px-1">
      <div className="mb-8 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-3 h-10 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-sm)]">
            <Skeleton className="h-6 w-40" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-11" />
            </div>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-sm)]">
            <Skeleton className="h-6 w-48" />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          </div>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]">
          <Skeleton className="h-6 w-40" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
          <Skeleton className="mt-4 h-11" />
        </div>
      </div>
    </section>
  );
}
