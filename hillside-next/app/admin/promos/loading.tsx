export default function AdminPromosLoading() {
  return (
    <section className="mx-auto w-full max-w-[1600px] animate-pulse space-y-4">
      <div className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
        <div className="h-3 w-24 rounded bg-[var(--color-border)]" />
        <div className="mt-3 h-9 w-44 rounded bg-[var(--color-border)]" />
        <div className="mt-3 h-4 w-80 rounded bg-[var(--color-border)]" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={`promo-loading-${i}`} className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
          <div className="h-4 w-40 rounded bg-[var(--color-border)]" />
          <div className="mt-2 h-3 w-3/4 rounded bg-[var(--color-border)]" />
        </div>
      ))}
    </section>
  );
}
