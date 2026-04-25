import { Skeleton } from "../../components/shared/Skeleton";

export default function MyBookingsLoading() {
  return (
    <section className="mx-auto w-full max-w-5xl overflow-x-hidden">
      <div className="mb-6 rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-9 w-52" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="mb-4 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm">
        <div className="grid gap-2 lg:grid-cols-[1fr_0.72fr]">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={`my-bookings-loading-${idx}`} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-2 h-4 w-56" />
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
