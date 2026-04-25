import { Skeleton } from "../../components/shared/Skeleton";

export default function ToursLoading() {
  return (
    <section className="mx-auto w-full max-w-4xl">
      <div className="mb-6 rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-2 h-9 w-52" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
        <Skeleton className="mt-4 h-24" />
        <Skeleton className="mt-4 h-24" />
        <Skeleton className="mt-6 h-11" />
      </div>
    </section>
  );
}
