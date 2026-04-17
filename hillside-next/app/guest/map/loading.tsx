export default function GuestMapLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl animate-pulse">
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-8 w-48 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-80 rounded bg-slate-100" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-[320px] rounded-xl bg-slate-100" />
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="h-28 rounded-xl bg-slate-100" />
          <div className="h-28 rounded-xl bg-slate-100" />
        </div>
      </div>
    </section>
  );
}
