export default function AdminReportsLoading() {
  return (
    <section className="mx-auto w-full max-w-[1600px] animate-pulse">
      <div className="mb-6 rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
        <div className="h-3 w-24 rounded bg-[var(--color-border)]" />
        <div className="mt-3 h-9 w-56 rounded bg-[var(--color-border)]" />
        <div className="mt-3 h-4 w-80 rounded bg-[var(--color-border)]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
            <div className="h-3 w-20 rounded bg-[var(--color-border)]" />
            <div className="mt-2 h-7 w-24 rounded bg-[var(--color-border)]" />
          </div>
        ))}
      </div>
    </section>
  );
}


