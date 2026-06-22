export default function AdminAuditLoading() {
  return (
    <section className="mx-auto w-full max-w-[1600px] animate-pulse">
      <div className="mb-5 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
        <div className="h-9 w-56 rounded bg-[var(--color-border)]" />
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-[var(--color-border)]" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-sm">
        {Array.from({ length: 9 }).map((_, row) => (
          <div key={row} className="grid grid-cols-5 gap-4 border-b border-[var(--color-border)] px-4 py-4 last:border-b-0">
            {Array.from({ length: 5 }).map((_, col) => (
              <div key={col} className="h-4 rounded bg-[var(--color-background)]" />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

