export default function AdminPaymentsLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl animate-pulse">
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-9 w-64 rounded bg-slate-200" />
      </div>
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-28 rounded-lg bg-slate-200" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {Array.from({ length: 8 }).map((_, row) => (
          <div key={row} className="grid grid-cols-4 gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0">
            {Array.from({ length: 4 }).map((_, col) => (
              <div key={col} className="h-4 rounded bg-slate-100" />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

