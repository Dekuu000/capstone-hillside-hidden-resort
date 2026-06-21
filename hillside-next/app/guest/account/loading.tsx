import { Skeleton } from "../../../components/shared/Skeleton";

export default function GuestAccountLoading() {
  return (
    <section className="mx-auto w-full max-w-3xl space-y-4">
      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-9 w-44" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={`account-field-${idx}`} className="h-12" />
          ))}
        </div>
      </div>
    </section>
  );
}
