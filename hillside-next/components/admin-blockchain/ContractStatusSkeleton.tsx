export function ContractStatusSkeleton() {
  return (
    <section className="surface p-4 sm:p-5" aria-hidden="true">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="skeleton h-8 w-48" />
        <div className="flex gap-2">
          <div className="skeleton h-11 w-28" />
          <div className="skeleton h-11 w-24" />
          <div className="skeleton h-11 w-28" />
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
      </div>
    </section>
  );
}

