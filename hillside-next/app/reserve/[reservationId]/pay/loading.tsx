export default function ReservePayLoading() {
  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <div className="mx-auto w-full max-w-[640px] px-4 py-12 md:px-6">
        <div className="animate-pulse space-y-4 rounded-3xl border border-[var(--color-border)] bg-white p-6 shadow-sm">
          <div className="h-4 w-24 rounded bg-[var(--color-border)]" />
          <div className="h-9 w-56 rounded bg-[var(--color-border)]" />
          <div className="h-40 rounded-2xl bg-[var(--color-border)]" />
          <div className="h-12 rounded-xl bg-[var(--color-border)]" />
        </div>
      </div>
    </main>
  );
}
