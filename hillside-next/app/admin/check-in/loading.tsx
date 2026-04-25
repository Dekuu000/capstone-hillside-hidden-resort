import { Skeleton } from "../../../components/shared/Skeleton";

export default function AdminCheckinLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <Skeleton className="mb-3 h-5 w-48" />
          <Skeleton className="h-[440px] rounded-2xl" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-11 w-44 rounded-xl" />
            <Skeleton className="h-11 w-36 rounded-xl" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-3 h-11 rounded-xl" />
            <Skeleton className="mt-3 h-28 rounded-xl" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-3 h-10 rounded-xl" />
            <Skeleton className="mt-2 h-10 rounded-xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
