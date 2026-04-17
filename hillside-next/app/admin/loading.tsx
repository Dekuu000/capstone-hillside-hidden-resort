import { ResortSnapshotSkeleton } from "../../components/admin-dashboard/ResortSnapshotSkeleton";
import { Skeleton } from "../../components/shared/Skeleton";

export default function AdminDashboardLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl animate-pulse space-y-4">
      <div className="surface p-4 sm:p-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-9 w-80 max-w-full" />
        <Skeleton className="mt-3 h-4 w-[28rem] max-w-full" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
        <ResortSnapshotSkeleton />
        <div className="surface p-4 sm:p-5">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="mt-3 h-7 w-64 max-w-full" />
          <Skeleton className="mt-2 h-4 w-full" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </div>
      </div>

      <div className="surface p-4 sm:p-5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-8 w-80 max-w-full" />
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      </div>
    </section>
  );
}
