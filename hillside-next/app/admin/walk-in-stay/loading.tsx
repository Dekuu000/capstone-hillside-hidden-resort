export default function AdminWalkInStayLoading() {
  return (
    <section className="mx-auto w-full max-w-[1600px] animate-pulse">
      <div className="mb-6 h-24 rounded-2xl bg-[var(--color-background)]" />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="h-[460px] rounded-2xl bg-[var(--color-background)]" />
        <div className="h-[460px] rounded-2xl bg-[var(--color-background)]" />
      </div>
    </section>
  );
}


