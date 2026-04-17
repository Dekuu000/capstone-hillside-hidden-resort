import { GuestShell } from "../../../components/layout/GuestShell";

export default function GuestProfileLoading() {
  return (
    <GuestShell>
      <header className="mb-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
        <div className="skeleton h-8 w-52" />
        <div className="mt-2 skeleton h-4 w-72" />
      </header>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="surface p-5">
          <div className="skeleton h-5 w-40" />
          <div className="mt-4 space-y-3">
            <div className="skeleton h-12" />
            <div className="skeleton h-10" />
          </div>
        </div>
        <div className="surface p-5">
          <div className="skeleton h-5 w-32" />
          <div className="mt-4 space-y-3">
            <div className="skeleton h-12" />
            <div className="skeleton h-10" />
          </div>
        </div>
      </section>
    </GuestShell>
  );
}
