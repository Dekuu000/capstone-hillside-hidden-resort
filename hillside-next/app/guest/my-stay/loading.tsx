export default function GuestMyStayLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl animate-pulse">
      <div className="mb-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <div className="h-8 w-44 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-72 rounded bg-slate-100" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <div className="h-5 w-40 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-56 rounded bg-slate-100" />
          <div className="mt-3 h-6 w-24 rounded-full bg-slate-200" />
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
          <div className="h-5 w-40 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-48 rounded bg-slate-100" />
          <div className="mt-2 h-4 w-64 rounded bg-slate-100" />
          <div className="mt-2 h-4 w-full rounded bg-slate-100" />
        </div>
      </div>
    </section>
  );
}
