export default function AdminCheckinLoading() {
  return (
    <section className="mx-auto w-full max-w-6xl animate-pulse">
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-9 w-64 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-80 rounded bg-slate-100" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 h-5 w-48 rounded bg-slate-200" />
          <div className="h-[440px] rounded-2xl bg-slate-100" />
          <div className="mt-3 flex gap-2">
            <div className="h-11 w-44 rounded-xl bg-slate-200" />
            <div className="h-11 w-36 rounded-xl bg-slate-200" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-5 w-48 rounded bg-slate-200" />
            <div className="mt-3 h-11 rounded-xl bg-slate-100" />
            <div className="mt-3 h-28 rounded-xl bg-slate-100" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-5 w-36 rounded bg-slate-200" />
            <div className="mt-3 h-10 rounded-xl bg-slate-100" />
            <div className="mt-2 h-10 rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    </section>
  );
}
