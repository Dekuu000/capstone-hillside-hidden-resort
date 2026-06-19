export default function AdminWalkInTourLoading() {
  return (
    <section className="mx-auto w-full max-w-[1600px] animate-pulse">
      <div className="mb-5 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
        <div className="h-9 w-64 rounded bg-[var(--color-border)]" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
            <div className="h-5 w-36 rounded bg-[var(--color-border)]" />
            <div className="mt-2 h-4 w-full rounded bg-[var(--color-background)]" />
            <div className="mt-2 h-4 w-2/3 rounded bg-[var(--color-background)]" />
          </div>
        ))}
      </div>
    </section>
  );
}


