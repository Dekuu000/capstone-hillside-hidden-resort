import { GuestShell } from "../../../components/layout/GuestShell";

export default function GuestSyncLoading() {
  return (
    <GuestShell>
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
        <div className="skeleton h-8 w-52" />
        <div className="mt-2 skeleton h-4 w-80" />
      </section>
      <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
          <div className="skeleton h-5 w-40" />
          <div className="mt-4 space-y-3">
            <div className="skeleton h-14 w-full" />
            <div className="skeleton h-14 w-full" />
            <div className="skeleton h-14 w-full" />
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
          <div className="skeleton h-5 w-32" />
          <div className="mt-4 space-y-3">
            <div className="skeleton h-16 w-full" />
            <div className="skeleton h-16 w-full" />
          </div>
        </div>
      </section>
    </GuestShell>
  );
}
