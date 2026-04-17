export default function AdminUnitsLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl animate-pulse">
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-9 w-52 rounded bg-slate-200" />
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-slate-200" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-5 w-24 rounded bg-slate-200" />
            <div className="mt-2 h-4 w-full rounded bg-slate-100" />
            <div className="mt-2 h-4 w-2/3 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </section>
  );
}

