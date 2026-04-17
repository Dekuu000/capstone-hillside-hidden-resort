export default function AdminEscrowLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl animate-pulse">
      <div className="mb-5 space-y-2">
        <div className="h-9 w-72 rounded bg-slate-200" />
        <div className="h-4 w-96 rounded bg-slate-200" />
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="h-3 w-16 rounded bg-slate-200" />
            <div className="mt-2 h-7 w-12 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-6 gap-4 border-b border-slate-100 px-4 py-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 rounded bg-slate-200" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, row) => (
          <div key={row} className="grid grid-cols-6 gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0">
            {Array.from({ length: 6 }).map((_, col) => (
              <div key={col} className="h-4 rounded bg-slate-100" />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

