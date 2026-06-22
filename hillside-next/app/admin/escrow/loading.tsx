import { Skeleton } from "../../../components/shared/Skeleton";

export default function AdminEscrowLoading() {
  return (
    <section className="mx-auto w-full max-w-[1600px]">
      <div className="mb-5 space-y-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[var(--color-border)] bg-white p-3 shadow-sm">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-7 w-12" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-sm">
        <div className="grid grid-cols-6 gap-4 border-b border-[var(--color-border)] px-4 py-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 rounded" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, row) => (
          <div key={row} className="grid grid-cols-6 gap-4 border-b border-[var(--color-border)] px-4 py-4 last:border-b-0">
            {Array.from({ length: 6 }).map((_, col) => (
              <Skeleton key={col} className="h-4 rounded" />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}


