export default function AdminSyncLoading() {
  return (
    <section className="mx-auto w-full max-w-[1600px] animate-pulse space-y-4">
      <div className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
        <div className="h-3 w-24 rounded bg-[var(--color-border)]" />
        <div className="mt-3 h-9 w-56 rounded bg-[var(--color-border)]" />
        <div className="mt-3 h-4 w-80 rounded bg-[var(--color-border)]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={`sync-tile-${i}`} className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
            <div className="h-3 w-20 rounded bg-[var(--color-border)]" />
            <div className="mt-2 h-7 w-16 rounded bg-[var(--color-border)]" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={`sync-row-${i}`} className="mb-2 h-10 rounded bg-[var(--color-border)]" />
        ))}
      </div>
    </section>
  );
}
