export default function AdminTeamLoading() {
  return (
    <section className="mx-auto w-full max-w-[1600px] animate-pulse space-y-4">
      <div className="rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
        <div className="h-3 w-24 rounded bg-[var(--color-border)]" />
        <div className="mt-3 h-9 w-40 rounded bg-[var(--color-border)]" />
        <div className="mt-3 h-4 w-80 rounded bg-[var(--color-border)]" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={`team-loading-${i}`} className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
          <div className="h-11 w-11 rounded-full bg-[var(--color-border)]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 rounded bg-[var(--color-border)]" />
            <div className="h-3 w-56 rounded bg-[var(--color-border)]" />
          </div>
          <div className="h-7 w-24 rounded-full bg-[var(--color-border)]" />
        </div>
      ))}
    </section>
  );
}
