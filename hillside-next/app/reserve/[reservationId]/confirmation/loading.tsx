export default function ReserveConfirmationLoading() {
  return (
    <main className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <div className="mx-auto w-full max-w-[640px] px-4 py-12 md:px-6">
        <div className="animate-pulse flex flex-col items-center gap-4 rounded-3xl border border-[var(--color-border)] bg-white p-6 text-center shadow-sm">
          <div className="h-14 w-14 rounded-full bg-[var(--color-border)]" />
          <div className="h-7 w-48 rounded bg-[var(--color-border)]" />
          <div className="h-4 w-64 rounded bg-[var(--color-border)]" />
          <div className="mt-2 h-32 w-full rounded-2xl bg-[var(--color-border)]" />
        </div>
      </div>
    </main>
  );
}
